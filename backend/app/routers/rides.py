"""Ride-planning router — M3 implementation.

Surface (all under ``/api/rides`` per M3 plan decision to keep the legacy URL):

  POST   /                                — create RidePlan (auth; captain auto-joined; group→ChatGroup)
  GET    /feed                            — upcoming planned group rides (auth optional, filterable)
  GET    /mine                            — rides I captain or participate in (auth)
  GET    /{id}                            — detail (auth optional)
  PUT    /{id}                            — update mutable fields (captain only)
  DELETE /{id}                            — cancel (captain only; soft)
  POST   /{id}/join                       — request to join (atomic ON CONFLICT)
  POST   /{id}/leave                      — self-leave (captain blocked)
  GET    /{id}/participants               — list (auth optional, paginated, filter by status)
  PUT    /{id}/participants/{user_id}     — captain approve / reject

Patterns reused from M2 audit:
  - Atomic upsert via ``pg_insert(...).on_conflict_do_update(...)`` for join.
  - Stable ``.id.asc()`` tiebreaker on every paginated query.
  - ``selectinload`` for captain / destination / participants.user to avoid N+1.
  - Renamed-currency / INR-only is irrelevant here; M3 is currency-agnostic.

Status transitions handled: ``planned → cancelled`` only.
``in_progress`` and ``completed`` move with the post-ride capture flow in M4.

Phase 4 W6 — capacity: ``max_riders`` is enforced by
``services/ride_capacity``. Approving into a full ride returns 409; a captain
can instead set ``waitlisted``, and the queue drains automatically (FIFO) when
a rider leaves, an approved rider is rejected, or ``max_riders`` is raised.
"""
from __future__ import annotations

from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.chat import ChatGroup
from app.models.destination import Destination
from app.models.notification import EntityType, NotificationType
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.models.ride_log import RideLog
from app.models.social import Follow
from app.models.user import User
from app.schemas.destination import DestinationSummary
from app.schemas.ride import (
    MineRideOut,
    MineRidesResponse,
    ParticipantListResponse,
    ParticipantStatusUpdate,
    RidePlanCreate,
    RidePlanListResponse,
    RidePlanOut,
    RidePlanParticipantOut,
    RidePlanSummary,
    RidePlanUpdate,
)
from app.schemas.ride_log import RideLogListResponse, RideLogOut
from app.schemas.user import UserBrief
from app.services.badge_engine import safe_evaluate as _evaluate_badges
from app.services.ride_helpers import approved_counts_for as _approved_counts_for
from app.services import notifications as notification_service
from app.services import ride_capacity

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_ride_or_404(db: Session, ride_id: UUID) -> RidePlan:
    ride = (
        db.query(RidePlan)
        .options(
            selectinload(RidePlan.destination),
            selectinload(RidePlan.captain),
            selectinload(RidePlan.participants).selectinload(
                RidePlanParticipant.user
            ),
            selectinload(RidePlan.chat_group),
        )
        .filter(RidePlan.id == ride_id)
        .first()
    )
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    return ride


def _approved_user_ids(db: Session, ride_id: UUID) -> list[UUID]:
    """User ids of everyone currently holding a seat on this ride.

    The audience for ride-wide announcements (cancelled, starting). Includes
    the captain, who is auto-joined as approved; ``notify_many`` drops the
    actor, so a captain-triggered announcement does not notify the captain.
    """
    return [
        row[0]
        for row in db.query(RidePlanParticipant.user_id).filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
    ]


_DECISION_NOTIFICATIONS = {
    ParticipantStatus.approved: (
        NotificationType.ride_join_approved,
        "You're in: {title}",
        "The captain approved your request.",
    ),
    ParticipantStatus.rejected: (
        NotificationType.ride_join_rejected,
        "Your request for {title} was declined",
        None,
    ),
    ParticipantStatus.waitlisted: (
        NotificationType.ride_waitlisted,
        "You're on the waitlist for {title}",
        "The ride is full. You'll be added automatically if a seat frees up.",
    ),
}


def _notify_participant_decision(
    db: Session,
    ride: RidePlan,
    participant: RidePlanParticipant,
    actor: User,
) -> None:
    """Tell a rider what the captain decided about their request."""
    entry = _DECISION_NOTIFICATIONS.get(participant.status)
    if entry is None:
        return
    kind, title, body = entry
    notification_service.safe_notify_commit(
        db,
        user_id=participant.user_id,
        type=kind,
        title=title.format(title=ride.title),
        body=body,
        actor_id=actor.id,
        entity_type=EntityType.ride,
        entity_id=ride.id,
    )


def _notify_promotions(
    db: Session, ride: RidePlan, promoted: list[RidePlanParticipant]
) -> None:
    """Tell waitlisted riders that a seat opened up and they took it.

    No actor: the promotion is the system reacting to a freed seat, not a
    person acting on the rider. Passing the leaving rider as the actor would
    both misattribute it and, when a rider's own departure frees a seat they
    were somehow queued for, silently drop the notification via the
    don't-notify-yourself rule.
    """
    for p in promoted:
        notification_service.safe_notify_commit(
            db,
            user_id=p.user_id,
            type=NotificationType.ride_waitlist_promoted,
            title=f"A seat opened up: {ride.title}",
            body="You've moved off the waitlist and you're now approved.",
            entity_type=EntityType.ride,
            entity_id=ride.id,
        )


def _build_detail_response(db: Session, ride: RidePlan) -> RidePlanOut:
    cap = ride_capacity.snapshot(db, ride)
    return RidePlanOut(
        id=ride.id,
        destination_id=ride.destination_id,
        route_id=ride.route_id,
        captain_id=ride.captain_id,
        title=ride.title,
        description=ride.description,
        thumbnail_url=ride.thumbnail_url,
        planned_date=ride.planned_date,
        planned_start_time=ride.planned_start_time,
        estimated_end_time=ride.estimated_end_time,
        visibility=ride.visibility,
        difficulty_level=ride.difficulty_level,
        recommended_bike_type=ride.recommended_bike_type,
        break_schedule=ride.break_schedule,
        max_riders=ride.max_riders,
        status=ride.status,
        created_at=ride.created_at,
        updated_at=ride.updated_at,
        chat_group_id=ride.chat_group.id if ride.chat_group else None,
        destination=(
            DestinationSummary.model_validate(ride.destination)
            if ride.destination
            else None
        ),
        captain=UserBrief.model_validate(ride.captain) if ride.captain else None,
        participants=[
            RidePlanParticipantOut.model_validate(p) for p in ride.participants
        ],
        participant_count=cap.seats_taken,
        seats_available=cap.seats_available,
        waitlist_count=cap.waitlist_count,
    )


def _build_summary(ride: RidePlan, approved_count: int) -> RidePlanSummary:
    return RidePlanSummary(
        id=ride.id,
        title=ride.title,
        thumbnail_url=ride.thumbnail_url,
        destination=(
            DestinationSummary.model_validate(ride.destination)
            if ride.destination
            else None
        ),
        captain=UserBrief.model_validate(ride.captain) if ride.captain else None,
        planned_date=ride.planned_date,
        planned_start_time=ride.planned_start_time,
        visibility=ride.visibility,
        difficulty_level=ride.difficulty_level,
        status=ride.status,
        max_riders=ride.max_riders,
        participant_count=approved_count,
    )


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@router.post("", response_model=RidePlanOut, status_code=201)
def create_ride(
    payload: RidePlanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanOut:
    # Validate destination exists before any write so a bad payload doesn't
    # flush a half-built row that has to roll back (M2 audit finding #11).
    dest = (
        db.query(Destination.id)
        .filter(Destination.id == payload.destination_id)
        .first()
    )
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")

    ride = RidePlan(
        destination_id=payload.destination_id,
        route_id=payload.route_id,
        captain_id=user.id,
        title=payload.title,
        description=payload.description,
        thumbnail_url=payload.thumbnail_url,
        planned_date=payload.planned_date,
        planned_start_time=payload.planned_start_time,
        estimated_end_time=payload.estimated_end_time,
        visibility=payload.visibility,
        difficulty_level=payload.difficulty_level,
        recommended_bike_type=payload.recommended_bike_type,
        break_schedule=payload.break_schedule,
        max_riders=payload.max_riders,
        status=RidePlanStatus.planned,
    )
    db.add(ride)
    db.flush()

    # Captain auto-joins as approved — same transaction. Decision locked in
    # the M3 plan: "is X going on this ride" queries stay simple.
    db.add(
        RidePlanParticipant(
            ride_plan_id=ride.id,
            user_id=user.id,
            status=ParticipantStatus.approved,
        )
    )

    # Group rides get a ChatGroup immediately so M5's chat endpoints have
    # something to attach to. Solo rides skip it (decision locked in plan).
    if ride.visibility == RidePlanVisibility.group:
        db.add(ChatGroup(ride_plan_id=ride.id, name=ride.title))

    db.commit()

    # M8 side effect: a fresh RidePlan moves the captain's
    # rides_captained count up by one, which may unlock the
    # ``captain-bronze`` or ``captain-silver`` badge. Wrapped in
    # safe_evaluate so a badge-engine failure can't fail the ride
    # create itself.
    _evaluate_badges(db, user.id)

    fresh = _load_ride_or_404(db, ride.id)
    return _build_detail_response(db, fresh)


# ---------------------------------------------------------------------------
# Feed (upcoming planned group rides)
# ---------------------------------------------------------------------------
@router.get("/feed", response_model=RidePlanListResponse)
def ride_feed(
    destination_id: Optional[UUID] = Query(default=None),
    region: Optional[str] = Query(default=None, max_length=100),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    following_only: bool = Query(
        default=False,
        description="Only show rides captained by users I follow. Requires authentication.",
    ),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
) -> RidePlanListResponse:
    today = date.today()
    query = (
        db.query(RidePlan)
        .options(
            selectinload(RidePlan.destination),
            selectinload(RidePlan.captain),
        )
        .filter(
            RidePlan.status == RidePlanStatus.planned,
            RidePlan.visibility == RidePlanVisibility.group,
            RidePlan.planned_date >= today,
        )
    )

    if destination_id is not None:
        query = query.filter(RidePlan.destination_id == destination_id)
    if region:
        query = query.join(Destination, Destination.id == RidePlan.destination_id).filter(
            Destination.region.ilike(f"%{region}%")
        )
    if date_from is not None:
        query = query.filter(RidePlan.planned_date >= date_from)
    if date_to is not None:
        query = query.filter(RidePlan.planned_date <= date_to)
    if following_only:
        # M6: filter to captains in the set of users I follow. Requires auth —
        # otherwise the question "rides I follow" is meaningless.
        if user is None:
            raise HTTPException(
                status_code=400,
                detail="following_only=true requires authentication",
            )
        followed_ids = (
            select(Follow.followed_id)
            .where(Follow.follower_id == user.id)
            .scalar_subquery()
        )
        query = query.filter(RidePlan.captain_id.in_(followed_ids))

    total = query.with_entities(func.count(RidePlan.id)).scalar() or 0
    rows = (
        query.order_by(
            RidePlan.planned_date.asc(),
            RidePlan.planned_start_time.asc(),
            RidePlan.id.asc(),
        )
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    counts = _approved_counts_for(db, [r.id for r in rows])
    return RidePlanListResponse(
        rides=[_build_summary(r, counts.get(r.id, 0)) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Mine (captained or participating)
# ---------------------------------------------------------------------------
@router.get("/mine", response_model=MineRidesResponse)
def my_rides(
    status: Optional[RidePlanStatus] = Query(default=None),
    include_left: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MineRidesResponse:
    # LEFT JOIN to the participant row for the current user — captures both
    # captained rides (status filtered by RidePlan.status) and joined rides
    # in one query, while exposing my own participant status for the response.
    my_part = (
        db.query(RidePlanParticipant)
        .filter(RidePlanParticipant.user_id == user.id)
        .subquery()
    )

    base = (
        db.query(RidePlan, my_part.c.status.label("my_status"))
        .options(
            selectinload(RidePlan.destination),
            selectinload(RidePlan.captain),
        )
        .outerjoin(my_part, my_part.c.ride_plan_id == RidePlan.id)
    )

    participant_filter = my_part.c.user_id == user.id
    if not include_left:
        participant_filter = and_(
            participant_filter, my_part.c.status != ParticipantStatus.left
        )

    base = base.filter(
        or_(RidePlan.captain_id == user.id, participant_filter)
    )

    if status is not None:
        base = base.filter(RidePlan.status == status)

    total = (
        base.with_entities(func.count(func.distinct(RidePlan.id))).scalar() or 0
    )
    rows = (
        base.order_by(RidePlan.planned_date.desc(), RidePlan.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    counts = _approved_counts_for(db, [r.RidePlan.id for r in rows])

    out: List[MineRideOut] = []
    for row in rows:
        ride = row.RidePlan
        is_captain = ride.captain_id == user.id
        summary = _build_summary(ride, counts.get(ride.id, 0)).model_dump()
        out.append(
            MineRideOut(
                **summary,
                role="captain" if is_captain else "participant",
                # Captain row is also in participants (auto-joined) with
                # approved — surface that for consistency on the captain card.
                my_participant_status=(
                    ParticipantStatus.approved if is_captain else row.my_status
                ),
            )
        )

    return MineRidesResponse(rides=out, total=total, page=page, limit=limit)


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
@router.get("/{ride_id}", response_model=RidePlanOut)
def get_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> RidePlanOut:
    ride = _load_ride_or_404(db, ride_id)
    return _build_detail_response(db, ride)


# ---------------------------------------------------------------------------
# Update (captain only)
# ---------------------------------------------------------------------------
@router.put("/{ride_id}", response_model=RidePlanOut)
def update_ride(
    ride_id: UUID,
    payload: RidePlanUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanOut:
    ride = _load_ride_or_404(db, ride_id)
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can update this ride")
    if ride.status in {RidePlanStatus.cancelled, RidePlanStatus.completed}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot update a {ride.status.value} ride",
        )

    changes = payload.model_dump(exclude_unset=True)

    # Phase 4 W6: max_riders became binding, so changing it has to be checked
    # against the riders already seated. Lowering it below the approved count
    # is rejected rather than silently bumping people who were already told
    # they were in — un-approving a rider is a captain decision, not a
    # side effect of editing a number.
    new_max = changes.get("max_riders")
    if new_max is not None and new_max != ride.max_riders:
        ride_capacity.lock_ride(db, ride.id)
        taken = ride_capacity.seats_taken(db, ride.id)
        if new_max < taken:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Cannot set max_riders to {new_max}: {taken} riders are "
                    f"already approved. Reject riders first, or pick a value "
                    f">= {taken}."
                ),
            )

    for field, value in changes.items():
        setattr(ride, field, value)

    # Raising max_riders opens seats; fill them from the waitlist immediately
    # rather than waiting for the captain to re-approve each queued rider.
    promoted: list[RidePlanParticipant] = []
    if new_max is not None:
        db.flush()
        promoted = ride_capacity.promote_from_waitlist(db, ride)

    db.commit()

    for p in promoted:
        _evaluate_badges(db, p.user_id)

    fresh = _load_ride_or_404(db, ride.id)
    return _build_detail_response(db, fresh)


# ---------------------------------------------------------------------------
# Cancel (captain only, soft)
# ---------------------------------------------------------------------------
@router.delete("/{ride_id}", response_model=RidePlanOut)
def cancel_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanOut:
    ride = _load_ride_or_404(db, ride_id)
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can cancel this ride")

    if ride.status != RidePlanStatus.cancelled:
        audience = _approved_user_ids(db, ride.id)
        ride.status = RidePlanStatus.cancelled
        notification_service.safe_notify_many(
            db,
            user_ids=audience,
            type=NotificationType.ride_cancelled,
            title=f"{ride.title} was cancelled",
            body=f"{user.name} cancelled this ride.",
            actor_id=user.id,
            entity_type=EntityType.ride,
            entity_id=ride.id,
        )
        db.commit()

    fresh = _load_ride_or_404(db, ride.id)
    return _build_detail_response(db, fresh)


# ---------------------------------------------------------------------------
# Start / Complete (captain only) — M4 status transitions
# ---------------------------------------------------------------------------
@router.post("/{ride_id}/start", response_model=RidePlanOut)
def start_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanOut:
    ride = _load_ride_or_404(db, ride_id)
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can start this ride")
    if ride.status == RidePlanStatus.cancelled:
        raise HTTPException(status_code=409, detail="Cannot start a cancelled ride")
    if ride.status == RidePlanStatus.completed:
        raise HTTPException(status_code=409, detail="Cannot start an already-completed ride")

    if ride.status != RidePlanStatus.in_progress:
        ride.status = RidePlanStatus.in_progress
        notification_service.safe_notify_many(
            db,
            user_ids=_approved_user_ids(db, ride.id),
            type=NotificationType.ride_starting,
            title=f"{ride.title} is starting",
            body="The captain has started this ride. Ride safe.",
            actor_id=user.id,
            entity_type=EntityType.ride,
            entity_id=ride.id,
        )
        db.commit()

    fresh = _load_ride_or_404(db, ride.id)
    return _build_detail_response(db, fresh)


@router.post("/{ride_id}/complete", response_model=RidePlanOut)
def complete_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanOut:
    ride = _load_ride_or_404(db, ride_id)
    if ride.captain_id != user.id:
        raise HTTPException(
            status_code=403, detail="Only the captain can complete this ride"
        )
    if ride.status == RidePlanStatus.cancelled:
        raise HTTPException(status_code=409, detail="Cannot complete a cancelled ride")

    if ride.status != RidePlanStatus.completed:
        ride.status = RidePlanStatus.completed
        # Riders can still create / update their RideLog after this, which is
        # the point of the notification: it is the prompt to go log the ride.
        notification_service.safe_notify_many(
            db,
            user_ids=_approved_user_ids(db, ride.id),
            type=NotificationType.ride_completed,
            title=f"{ride.title} is complete",
            body="Log your ride and rate the destination.",
            actor_id=user.id,
            entity_type=EntityType.ride,
            entity_id=ride.id,
        )
        db.commit()

    fresh = _load_ride_or_404(db, ride.id)
    return _build_detail_response(db, fresh)


# ---------------------------------------------------------------------------
# Logs for a ride (M4) — public list, paginated, eager-loaded
# ---------------------------------------------------------------------------
@router.get("/{ride_id}/logs", response_model=RideLogListResponse)
def list_ride_logs(
    ride_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> RideLogListResponse:
    if not db.query(RidePlan.id).filter(RidePlan.id == ride_id).first():
        raise HTTPException(status_code=404, detail="Ride not found")

    base = db.query(RideLog).filter(RideLog.ride_plan_id == ride_id)
    total = base.with_entities(func.count(RideLog.id)).scalar() or 0
    rows = (
        base.options(
            selectinload(RideLog.media),
            selectinload(RideLog.rider),
            selectinload(RideLog.rating),
        )
        .order_by(RideLog.created_at.asc(), RideLog.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return RideLogListResponse(
        logs=[RideLogOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Join
# ---------------------------------------------------------------------------
@router.post(
    "/{ride_id}/join", response_model=RidePlanParticipantOut, status_code=201
)
def join_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanParticipantOut:
    ride = db.query(RidePlan).filter(RidePlan.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.status != RidePlanStatus.planned:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot join a {ride.status.value} ride",
        )
    if ride.captain_id == user.id:
        raise HTTPException(
            status_code=409,
            detail="Captain is auto-joined and cannot use the join endpoint",
        )

    existing = (
        db.query(RidePlanParticipant)
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.user_id == user.id,
        )
        .first()
    )
    if existing:
        if existing.status == ParticipantStatus.approved:
            raise HTTPException(status_code=409, detail="Already an approved participant")
        if existing.status == ParticipantStatus.rejected:
            raise HTTPException(
                status_code=403,
                detail="Previous join request was rejected by the captain",
            )

    # Atomic upsert. Pre-check above returns the clean 4xx for approved /
    # rejected; this path is for new joins and pending → pending (idempotent)
    # and left → pending (re-join after leaving).
    stmt = (
        pg_insert(RidePlanParticipant)
        .values(
            ride_plan_id=ride_id,
            user_id=user.id,
            status=ParticipantStatus.pending,
        )
        .on_conflict_do_update(
            constraint="uq_participant_ride_user",
            set_=dict(
                status=ParticipantStatus.pending,
                updated_at=func.now(),
            ),
        )
        .returning(RidePlanParticipant.id)
    )
    participant_id = db.execute(stmt).scalar_one()
    db.commit()

    participant = (
        db.query(RidePlanParticipant)
        .options(selectinload(RidePlanParticipant.user))
        .filter(RidePlanParticipant.id == participant_id)
        .one()
    )

    notification_service.safe_notify_commit(
        db,
        user_id=ride.captain_id,
        type=NotificationType.ride_join_requested,
        title=f"{user.name} wants to join {ride.title}",
        body="Review the request from the ride page.",
        actor_id=user.id,
        entity_type=EntityType.ride,
        entity_id=ride.id,
    )

    return RidePlanParticipantOut.model_validate(participant)


# ---------------------------------------------------------------------------
# Leave (self-only)
# ---------------------------------------------------------------------------
@router.post(
    "/{ride_id}/leave", response_model=RidePlanParticipantOut
)
def leave_ride(
    ride_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanParticipantOut:
    ride = db.query(RidePlan).filter(RidePlan.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id == user.id:
        raise HTTPException(
            status_code=409,
            detail="Captain cannot leave their own ride — cancel it instead",
        )

    participant = (
        db.query(RidePlanParticipant)
        .options(selectinload(RidePlanParticipant.user))
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.user_id == user.id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="You are not a participant of this ride")

    if participant.status != ParticipantStatus.left:
        freed_a_seat = participant.status == ParticipantStatus.approved
        promoted: list[RidePlanParticipant] = []

        if freed_a_seat:
            # Phase 4 W6: an approved rider leaving releases a seat. Lock,
            # write the leave, then promote the head of the waitlist into the
            # gap — all in one transaction, so there is no window where the
            # seat is free but unclaimed.
            ride_capacity.lock_ride(db, ride_id)

        participant.status = ParticipantStatus.left

        if freed_a_seat:
            db.flush()
            promoted = ride_capacity.promote_from_waitlist(db, ride)

        db.commit()
        db.refresh(participant)

        for p in promoted:
            _evaluate_badges(db, p.user_id)

        _notify_promotions(db, ride, promoted)

    return RidePlanParticipantOut.model_validate(participant)


# ---------------------------------------------------------------------------
# Participants
# ---------------------------------------------------------------------------
@router.get("/{ride_id}/participants", response_model=ParticipantListResponse)
def list_participants(
    ride_id: UUID,
    status: Optional[ParticipantStatus] = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> ParticipantListResponse:
    if not db.query(RidePlan.id).filter(RidePlan.id == ride_id).first():
        raise HTTPException(status_code=404, detail="Ride not found")

    base = db.query(RidePlanParticipant).filter(
        RidePlanParticipant.ride_plan_id == ride_id
    )
    if status is not None:
        base = base.filter(RidePlanParticipant.status == status)

    total = base.with_entities(func.count(RidePlanParticipant.id)).scalar() or 0
    rows = (
        base.options(selectinload(RidePlanParticipant.user))
        .order_by(
            RidePlanParticipant.created_at.asc(), RidePlanParticipant.id.asc()
        )
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return ParticipantListResponse(
        participants=[RidePlanParticipantOut.model_validate(p) for p in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.put(
    "/{ride_id}/participants/{user_id}", response_model=RidePlanParticipantOut
)
def update_participant_status(
    ride_id: UUID,
    user_id: UUID,
    payload: ParticipantStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RidePlanParticipantOut:
    ride = db.query(RidePlan).filter(RidePlan.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the captain can approve or reject participants",
        )
    if ride.captain_id == user_id:
        # Captain row exists in participants (auto-joined) but is not subject
        # to approve/reject — they cancel the ride instead.
        raise HTTPException(
            status_code=404,
            detail="Captain is not a participant in the approval sense",
        )

    participant = (
        db.query(RidePlanParticipant)
        .options(selectinload(RidePlanParticipant.user))
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.user_id == user_id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Schema validator restricts payload.status to
    # {approved, rejected, waitlisted}.
    if participant.status == payload.status:
        return RidePlanParticipantOut.model_validate(participant)

    was_approved = participant.status == ParticipantStatus.approved
    promoted: list[RidePlanParticipant] = []

    if payload.status == ParticipantStatus.approved:
        # Phase 4 W6: max_riders is binding. Lock the ride row first so two
        # concurrent approvals of the last seat serialise instead of both
        # reading the same pre-write count and overfilling the ride.
        ride_capacity.lock_ride(db, ride_id)
        cap = ride_capacity.snapshot(db, ride)
        if cap.is_full:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Ride is at capacity ({cap.seats_taken} of "
                    f"{cap.max_riders} seats taken). Raise max_riders, or set "
                    f"this rider to 'waitlisted' to queue them for the next "
                    f"free seat."
                ),
            )
        participant.status = payload.status
    else:
        participant.status = payload.status
        if was_approved:
            # Rejecting a rider who already held a seat frees it. Fill it from
            # the waitlist in the same transaction so the ride never sits
            # under capacity with people queued.
            ride_capacity.lock_ride(db, ride_id)
            db.flush()
            promoted = ride_capacity.promote_from_waitlist(db, ride)

    db.commit()
    db.refresh(participant)

    # M8 side effect: a fresh ``approved`` increases the participant's
    # rides_joined count (the engine excludes their own captained rides, so
    # captain-self-rows don't count). May unlock ``joiner-bronze``.
    # Rejection and waitlisting have no badge consequence.
    if participant.status == ParticipantStatus.approved:
        _evaluate_badges(db, participant.user_id)
    for p in promoted:
        _evaluate_badges(db, p.user_id)

    _notify_participant_decision(db, ride, participant, actor=user)
    _notify_promotions(db, ride, promoted)

    return RidePlanParticipantOut.model_validate(participant)
