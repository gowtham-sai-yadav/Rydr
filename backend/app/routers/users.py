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
from datetime import date, datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.ride import (
    Bike,
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.social import Follow, FollowStatus
from app.models.notification import NotificationType
from app.models.badge import UserBadge
from app.models.destination import Destination
from app.models.push_token import PushToken
from app.models.ride_log import RideLog, RideMedia
from app.models.route import Route
from app.models.user import User
from app.schemas.personal_records import BestEffortListResponse, BestEffortOut, PersonalRecordsOut
from app.schemas.year_in_rydr import TopDestinationOut, YearInRydrOut
from app.schemas.ride_log import TimelineEntryOut, TimelineResponse
from app.schemas.social import FollowEdgeOut, FollowListResponse, FollowOut
from app.services.notification_service import create_notification as _notify
from app.schemas.user import (
    BikeOut,
    BikeUpdate,
    PushTokenRegister,
    UserBrief,
    UserOut,
    UserStatsOut,
    UserUpdate,
)
from app.services.personal_records import compute_personal_records
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


@router.put("/me/push-token", status_code=204)
def register_push_token(
    data: PushTokenRegister,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Upserts by (user, token) - re-registering the same token on every
    app launch is expected and idempotent, not an error."""
    stmt = (
        pg_insert(PushToken)
        .values(user_id=user.id, token=data.token, platform=data.platform)
        .on_conflict_do_nothing(index_elements=["user_id", "token"])
    )
    db.execute(stmt)
    db.commit()
    return Response(status_code=204)


@router.delete("/me/push-token", status_code=204)
def unregister_push_token(
    token: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.query(PushToken).filter(PushToken.user_id == user.id, PushToken.token == token).delete(
        synchronize_session=False
    )
    db.commit()
    return Response(status_code=204)


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


@router.put("/me/bike/service", response_model=BikeOut)
def mark_bike_serviced(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resets the gear-tracking odometer after a real service — lifetime
    km is untouched, only the since-last-service counter zeroes out."""
    bike = db.query(Bike).filter(Bike.user_id == user.id).first()
    if not bike:
        raise HTTPException(status_code=404, detail="No bike on this account yet")
    bike.total_km_since_service = 0
    bike.last_serviced_at = datetime.now(timezone.utc)
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


@router.get("/{user_id}/visited-destinations")
def visited_destinations(user_id: UUID, db: Session = Depends(get_db)) -> dict:
    """Fog-of-war: distinct destinations this user has a completed ride
    log for. The frontend map lights these up and greys out the rest —
    no separate "visit" table needed, a ride log already means "I went"."""
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(RidePlan.destination_id)
        .join(RideLog, RideLog.ride_plan_id == RidePlan.id)
        .filter(RideLog.rider_id == user_id)
        .distinct()
        .all()
    )
    return {"visited_destination_ids": [str(r.destination_id) for r in rows]}


@router.put("/{user_id}/verify", response_model=UserOut)
def set_verified_rider(
    user_id: UUID,
    verified: bool = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_user),
) -> UserOut:
    """Ambassador program - admin-only, grants/revokes the verified-rider
    badge that lets someone officially endorse routes."""
    if not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_verified_rider = verified
    db.commit()
    return _load_user_with_social(db, user_id, viewer=admin)


@router.get("/{user_id}/personal-records", response_model=PersonalRecordsOut)
def get_personal_records(
    user_id: UUID,
    db: Session = Depends(get_db),
) -> PersonalRecordsOut:
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    records = compute_personal_records(db, user_id)
    return PersonalRecordsOut(
        longest_ride=records.longest_ride,
        best_month=records.best_month,
        most_destinations_in_a_week=records.most_destinations_in_a_week,
    )


@router.get("/{user_id}/timeline", response_model=TimelineResponse)
def get_timeline(
    user_id: UUID,
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
) -> TimelineResponse:
    """Photo-tagged timeline: every photo this rider has attached to a
    logged ride, newest first, placed on the map via the GPS point
    recorded at capture time (falls back to no map pin when the photo
    wasn't taken during a live-recorded track)."""
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")
    rows = (
        db.query(RideMedia, RideLog, RidePlan)
        .join(RideLog, RideLog.id == RideMedia.ride_log_id)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(RideLog.rider_id == user_id)
        .order_by(func.coalesce(RideMedia.captured_at, RideMedia.created_at).desc())
        .limit(limit)
        .all()
    )
    entries = [
        TimelineEntryOut(
            media_id=media.id,
            url=media.url,
            media_type=media.media_type,
            caption=media.caption,
            latitude=media.captured_latitude,
            longitude=media.captured_longitude,
            taken_at=media.captured_at or media.created_at,
            ride_log_id=log.id,
            ride_plan_id=plan.id,
            destination_name=plan.destination.name if plan.destination else None,
        )
        for media, log, plan in rows
    ]
    return TimelineResponse(entries=entries)


@router.get("/{user_id}/best-efforts", response_model=BestEffortListResponse)
def get_best_efforts(
    user_id: UUID,
    db: Session = Depends(get_db),
) -> BestEffortListResponse:
    """Fastest completion per matched Route — the repeatable-loop timing
    that route_matching.py's matched_route_id was built to enable."""
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    logs = (
        db.query(RideLog)
        .filter(
            RideLog.rider_id == user_id,
            RideLog.matched_route_id.isnot(None),
            RideLog.moving_duration_seconds.isnot(None),
        )
        .order_by(RideLog.matched_route_id, RideLog.moving_duration_seconds.asc())
        .all()
    )

    best_by_route: dict[UUID, RideLog] = {}
    attempts: dict[UUID, int] = {}
    for log in logs:
        attempts[log.matched_route_id] = attempts.get(log.matched_route_id, 0) + 1
        if log.matched_route_id not in best_by_route:
            best_by_route[log.matched_route_id] = log

    if not best_by_route:
        return BestEffortListResponse(efforts=[])

    routes = {
        r.id: r
        for r in db.query(Route)
        .options(selectinload(Route.destination))
        .filter(Route.id.in_(best_by_route.keys()))
        .all()
    }

    efforts = []
    for route_id, log in best_by_route.items():
        route = routes.get(route_id)
        efforts.append(
            BestEffortOut(
                route_id=route_id,
                route_name=route.name if route else None,
                destination_name=route.destination.name if route and route.destination else None,
                best_moving_duration_seconds=log.moving_duration_seconds,
                best_avg_speed_kmh=log.avg_speed_kmh,
                attempt_count=attempts[route_id],
                achieved_at=log.actual_start_ts.date() if log.actual_start_ts else None,
            )
        )
    efforts.sort(key=lambda e: e.achieved_at or date.min, reverse=True)
    return BestEffortListResponse(efforts=efforts)


@router.get("/{user_id}/year-in-rydr", response_model=YearInRydrOut)
def get_year_in_rydr(
    user_id: UUID,
    year: int = Query(default=None, description="Defaults to the current year"),
    db: Session = Depends(get_db),
) -> YearInRydrOut:
    """Annual recap - same underlying RideLog rows as Personal Records
    and the leaderboard, just windowed to one calendar year and rolled
    up differently."""
    if not _target_user_exists(db, user_id):
        raise HTTPException(status_code=404, detail="User not found")

    target_year = year or datetime.now(timezone.utc).year
    year_start = datetime(target_year, 1, 1, tzinfo=timezone.utc)
    year_end = datetime(target_year + 1, 1, 1, tzinfo=timezone.utc)

    rows = (
        db.query(RideLog, RidePlan.destination_id)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RideLog.rider_id == user_id,
            RideLog.actual_start_ts.isnot(None),
            RideLog.actual_start_ts >= year_start,
            RideLog.actual_start_ts < year_end,
        )
        .all()
    )

    total_distance = 0.0
    total_elevation = 0.0
    total_moving_seconds = 0
    longest_km: Optional[float] = None
    dest_ride_counts: dict[UUID, int] = {}
    active_months: set[int] = set()

    for log, destination_id in rows:
        if log.distance_km:
            total_distance += log.distance_km
            longest_km = max(longest_km or 0, log.distance_km)
        if log.elevation_gain_m:
            total_elevation += log.elevation_gain_m
        if log.moving_duration_seconds:
            total_moving_seconds += log.moving_duration_seconds
        dest_ride_counts[destination_id] = dest_ride_counts.get(destination_id, 0) + 1
        if log.actual_start_ts:
            active_months.add(log.actual_start_ts.month)

    top_destination: Optional[TopDestinationOut] = None
    if dest_ride_counts:
        top_id, top_count = max(dest_ride_counts.items(), key=lambda kv: kv[1])
        dest = db.query(Destination).filter(Destination.id == top_id).first()
        if dest:
            top_destination = TopDestinationOut(destination_id=top_id, name=dest.name, ride_count=top_count)

    badges_earned = (
        db.query(func.count(UserBadge.id))
        .filter(UserBadge.user_id == user_id, UserBadge.earned_at >= year_start, UserBadge.earned_at < year_end)
        .scalar()
        or 0
    )

    return YearInRydrOut(
        year=target_year,
        total_rides=len(rows),
        total_distance_km=round(total_distance, 1),
        total_elevation_gain_m=round(total_elevation, 0),
        total_moving_hours=round(total_moving_seconds / 3600, 1),
        longest_ride_km=longest_km,
        top_destination=top_destination,
        distinct_destinations=len(dest_ride_counts),
        badges_earned=badges_earned,
        active_months=len(active_months),
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
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Private accounts: the follow lands as `pending` until the target
    # accepts it via POST /follow-requests/{id}/accept - it does NOT count
    # toward followers_count / is_followed_by_me / DM eligibility until
    # then. Public accounts (the default): accepted immediately, same as
    # before this existed.
    target_status = FollowStatus.pending if target.is_private else FollowStatus.accepted

    # Atomic upsert pattern (M5 ride-log create, M2 rating). Re-follow of an
    # already-followed user returns 201 with the existing row — same
    # idempotent behaviour as elsewhere in the codebase.
    #
    # Public target: DO UPDATE SET status=accepted, so a stale `pending` row
    # (e.g. the account used to be private) upgrades on the next call.
    # Private target: DO NOTHING - a second request while one is already
    # pending/accepted shouldn't reset anything or re-notify.
    base_insert = pg_insert(Follow).values(
        follower_id=user.id, followed_id=user_id, status=target_status
    )
    if target.is_private:
        stmt = base_insert.on_conflict_do_nothing(
            index_elements=["follower_id", "followed_id"]
        )
    else:
        stmt = base_insert.on_conflict_do_update(
            index_elements=["follower_id", "followed_id"],
            set_={"status": FollowStatus.accepted},
        )
    stmt = stmt.returning(Follow.follower_id, Follow.followed_id, Follow.status, Follow.created_at)
    row = db.execute(stmt).first()

    if row is not None and row.status == FollowStatus.pending:
        _notify(
            db,
            user_id=user_id,
            type=NotificationType.follow_requested,
            message=f"{user.name} requested to follow you",
            actor_id=user.id,
        )

    db.commit()

    if row is None:
        follow = (
            db.query(Follow)
            .filter(Follow.follower_id == user.id, Follow.followed_id == user_id)
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
# Follow requests — private-account gate on the follow itself
# ---------------------------------------------------------------------------
@router.get("/me/follow-requests", response_model=FollowListResponse)
def list_follow_requests(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowListResponse:
    """Pending requests to follow ME, awaiting my accept/reject."""
    base = db.query(Follow).filter(
        Follow.followed_id == user.id, Follow.status == FollowStatus.pending
    )
    total = base.with_entities(func.count()).scalar() or 0
    rows = (
        base.options(selectinload(Follow.follower))
        .order_by(Follow.created_at.desc(), Follow.follower_id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    edges = [
        FollowEdgeOut(user=UserBrief.model_validate(f.follower), created_at=f.created_at)
        for f in rows
    ]
    return FollowListResponse(edges=edges, total=total, page=page, limit=limit)


@router.post("/follow-requests/{follower_id}/accept", response_model=FollowOut)
def accept_follow_request(
    follower_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FollowOut:
    follow = (
        db.query(Follow)
        .filter(
            Follow.follower_id == follower_id,
            Follow.followed_id == user.id,
            Follow.status == FollowStatus.pending,
        )
        .first()
    )
    if follow is None:
        raise HTTPException(status_code=404, detail="No pending follow request from this user")

    follow.status = FollowStatus.accepted
    _notify(
        db,
        user_id=follower_id,
        type=NotificationType.follow_accepted,
        message=f"{user.name} accepted your follow request",
        actor_id=user.id,
    )
    db.commit()
    db.refresh(follow)
    return FollowOut.model_validate(follow)


@router.delete("/follow-requests/{follower_id}", status_code=204)
def reject_follow_request(
    follower_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Reject (or cancel/withdraw, from the requester's own DELETE) a
    pending request. Deletes the row outright rather than a `rejected`
    status - the requester can send a fresh request later without a
    stale rejection blocking them."""
    db.query(Follow).filter(
        Follow.follower_id == follower_id,
        Follow.followed_id == user.id,
        Follow.status == FollowStatus.pending,
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
    # Accepted only - a pending request into a private account isn't a
    # real follower/following edge yet.
    base = db.query(Follow).filter(filter_field == filter_value, Follow.status == FollowStatus.accepted)
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
