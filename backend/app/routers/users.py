"""Users router — /me CRUD + bike + stats + public profile lookup + M6 follow surface.

M6 (2026-05-28) adds:
  - ``followers_count``, ``following_count``, ``is_followed_by_me`` on every
    ``UserOut`` response (computed via scalar subqueries folded into the
    main user SELECT — one round trip instead of four).
  - ``POST /api/users/{id}/follow`` — atomic, idempotent via Postgres
    ``ON CONFLICT DO NOTHING`` on the composite PK.
  - ``DELETE /api/users/{id}/follow`` — idempotent.
  - ``GET /api/users/{id}/followers`` and ``/following`` — paginated edge lists
    with the embedded UserBrief eager-loaded via ``joinedload``.
  - ``get_optional_user`` added to ``GET /api/users/{id}`` so ``is_followed_by_me``
    reflects the viewer.
"""
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.notification import EntityType, NotificationType
from app.models.ride import (
    Bike,
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.social import Follow
from app.models.user import User
from app.schemas.social import FollowEdgeOut, FollowListResponse, FollowOut
from app.schemas.user import (
    BikeOut,
    BikeUpdate,
    UserBrief,
    UserOut,
    UserStatsOut,
    UserUpdate,
)
from app.services import notifications as notification_service
from app.services.user_view import load_user_with_social as _load_user_with_social

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _target_user_exists(db: Session, user_id: UUID) -> bool:
    return (
        db.query(User.id).filter(User.id == user_id).first() is not None
    )


# ---------------------------------------------------------------------------
# Profile — /me and /{id}
# ---------------------------------------------------------------------------
@router.get("/me", response_model=UserOut)
def get_me(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    # Reuse the helper so /me and /{id} return identically-shaped UserOut.
    # is_followed_by_me will be False here — the EXISTS query against
    # ``follower_id == user.id AND followed_id == user.id`` matches zero
    # rows by the ``ck_follow_not_self`` constraint.
    return _load_user_with_social(db, user.id, viewer=user)


@router.put("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    return _load_user_with_social(db, user.id, viewer=user)


@router.put("/me/bike", response_model=BikeOut)
def update_bike(
    data: BikeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bike = db.query(Bike).filter(Bike.user_id == user.id).first()
    if not bike:
        bike = Bike(user_id=user.id)
        db.add(bike)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(bike, field, value)
    db.commit()
    db.refresh(bike)
    return bike


@router.get("/me/stats", response_model=UserStatsOut)
def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    captained = db.query(RidePlan).filter(RidePlan.captain_id == user.id).count()
    joined = (
        db.query(RidePlanParticipant)
        .filter(
            RidePlanParticipant.user_id == user.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .count()
    )
    completed = (
        db.query(RidePlan)
        .filter(
            RidePlan.captain_id == user.id,
            RidePlan.status == RidePlanStatus.completed,
        )
        .count()
    )
    return UserStatsOut(
        rides_captained=captained,
        rides_joined=joined,
        rides_completed=completed,
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
):
    # Auth is optional — anonymous callers get is_followed_by_me=False.
    return _load_user_with_social(db, user_id, viewer=viewer)


# ---------------------------------------------------------------------------
# Follow / unfollow
# ---------------------------------------------------------------------------
@router.post(
    "/{user_id}/follow", response_model=FollowOut, status_code=201
)
def follow_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowOut:
    # Self-follow gate before any DB round trip. The DB-level
    # ``ck_follow_not_self`` constraint is the backstop; this is the cheap
    # API-layer 400 with a clear message.
    if user_id == user.id:
        raise HTTPException(
            status_code=400, detail="You cannot follow yourself"
        )
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    # Atomic upsert pattern (M5 ride-log create, M2 rating). Re-follow of an
    # already-followed user returns 201 with the existing row — same idempotent
    # behaviour as elsewhere in the codebase.
    stmt = (
        pg_insert(Follow)
        .values(follower_id=user.id, followed_id=user_id)
        .on_conflict_do_nothing(
            index_elements=["follower_id", "followed_id"]
        )
        .returning(Follow.follower_id, Follow.followed_id, Follow.created_at)
    )
    row = db.execute(stmt).first()
    db.commit()

    # Only notify on a genuinely new edge. ON CONFLICT DO NOTHING returns None
    # for a re-follow, so this does not re-notify when a client retries.
    if row is not None:
        notification_service.safe_notify_commit(
            db,
            user_id=user_id,
            type=NotificationType.new_follower,
            title=f"{user.name} started following you",
            actor_id=user.id,
            entity_type=EntityType.user,
            entity_id=user.id,
        )

    if row is None:
        # Existing row — fetch for the response. The conflict guarantees a
        # matching row exists, so this is never None in practice.
        follow = (
            db.query(Follow)
            .filter(
                Follow.follower_id == user.id,
                Follow.followed_id == user_id,
            )
            .first()
        )
        if follow is None:
            raise HTTPException(
                status_code=500, detail="Follow state inconsistent after upsert"
            )
        return FollowOut.model_validate(follow)
    return FollowOut(
        follower_id=row.follower_id,
        followed_id=row.followed_id,
        created_at=row.created_at,
    )


@router.delete("/{user_id}/follow")
def unfollow_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Unfollow ``user_id``.

    Idempotent: returns 204 whether or not the caller was actually following
    the target. Nonexistent target user → 404 (consistent with ``follow_user``).
    Self-unfollow → 400 (parallel to ``follow_user``'s self-follow gate;
    there's no edge to delete and the API exists to handle real graphs).
    """
    if user_id == user.id:
        # Self-unfollow is a no-op semantically — there's no edge to delete.
        # 400 matches the symmetry with follow_user's self-follow gate.
        raise HTTPException(
            status_code=400, detail="You cannot unfollow yourself"
        )
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    # Idempotent — delete affects 0 or 1 rows; we return 204 either way.
    db.query(Follow).filter(
        Follow.follower_id == user.id,
        Follow.followed_id == user_id,
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Follow lists
# ---------------------------------------------------------------------------
def _paginated_follow_list(
    db: Session,
    *,
    filter_field,
    filter_value: UUID,
    order_tiebreak_field,
    relationship_to_load,
    project_to_user,
    page: int,
    limit: int,
) -> FollowListResponse:
    """Shared pagination for followers / following lists.

    ``filter_field`` is the FK column to match (``Follow.followed_id`` for
    "give me X's followers", ``Follow.follower_id`` for "give me who X follows").
    ``order_tiebreak_field`` is the OTHER FK column — used as the deterministic
    tiebreaker for ties on ``created_at``.
    ``relationship_to_load`` is the corresponding ORM relationship to eager-load
    (``Follow.follower`` / ``Follow.followed``).
    ``project_to_user`` extracts the user we want to embed in the edge.

    Audit #14: uses ``selectinload`` (separate IN-keyed SELECT) rather than
    ``joinedload`` (LEFT OUTER JOIN). Today the User join is 1:1 so either
    works, but ``joinedload`` + ``LIMIT/OFFSET`` is fragile when a future
    expansion adds a 1:N relationship into the loader chain — page sizes
    silently break. ``selectinload`` is one extra round trip but safe under
    any cardinality.
    """
    base = db.query(Follow).filter(filter_field == filter_value)
    total = base.with_entities(func.count()).scalar() or 0
    rows = (
        base.options(selectinload(relationship_to_load))
        .order_by(
            Follow.created_at.desc(), order_tiebreak_field.asc()
        )
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    edges = [
        FollowEdgeOut(
            user=UserBrief.model_validate(project_to_user(f)),
            created_at=f.created_at,
        )
        for f in rows
    ]
    return FollowListResponse(
        edges=edges, total=total, page=page, limit=limit
    )


@router.get("/{user_id}/followers", response_model=FollowListResponse)
def list_followers(
    user_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _viewer: Optional[User] = Depends(get_optional_user),
) -> FollowListResponse:
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return _paginated_follow_list(
        db,
        filter_field=Follow.followed_id,
        filter_value=user_id,
        order_tiebreak_field=Follow.follower_id,
        relationship_to_load=Follow.follower,
        project_to_user=lambda f: f.follower,
        page=page,
        limit=limit,
    )


@router.get("/{user_id}/following", response_model=FollowListResponse)
def list_following(
    user_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _viewer: Optional[User] = Depends(get_optional_user),
) -> FollowListResponse:
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return _paginated_follow_list(
        db,
        filter_field=Follow.follower_id,
        filter_value=user_id,
        order_tiebreak_field=Follow.followed_id,
        relationship_to_load=Follow.followed,
        project_to_user=lambda f: f.followed,
        page=page,
        limit=limit,
    )
