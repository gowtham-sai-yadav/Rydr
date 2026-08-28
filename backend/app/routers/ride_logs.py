"""Ride logs router — M4 post-ride capture.

Surface (all under ``/api/ride-logs`` except where noted):

  POST   /api/ride-logs                          — create caller's log (atomic upsert via ON CONFLICT)
  GET    /api/ride-logs/{id}                     — detail w/ media, rider, linked rating
  PATCH  /api/ride-logs/{id}                     — owner updates cost/notes/road/recommended/end_ts
  POST   /api/ride-logs/{id}/media/sign          — Cloudinary signed-upload params (503 if unconfigured)
  POST   /api/ride-logs/{id}/media                — confirm uploaded media + optional destination link
  DELETE /api/ride-logs/{id}/media/{media_id}    — remove a media row (does NOT delete from Cloudinary)
  GET    /api/ride-logs/{id}/summary             — flat card data (Phase 4 W4)

Patterns reused from M2/M3 audits:
  - Atomic upsert via ``pg_insert(...).on_conflict_do_nothing(...)`` on
    ``uq_ride_log_ride_rider`` for log creation idempotency.
  - ``selectinload`` for media + rider + rating to avoid N+1.
  - Explicit transaction boundaries: linking media to destination happens in
    the same commit so the flywheel never half-writes.

Authorization model:
  - Create log: must be approved participant *or* captain of the ride.
  - Update / sign / confirm / delete media: owner of the log only.
  - Detail: anyone (Phase 3 "everything public").
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.destination import Destination, DestinationMedia, Rating
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.ride_log import RideLog, RideMedia
from app.models.user import User
from app.schemas.ride_log import (
    CloudinarySignature,
    RideSummary,
    RideLogCreate,
    RideLogOut,
    RideLogUpdate,
    RideMediaConfirm,
    RideMediaOut,
)
from app.services import cloudinary_service, media_urls, stats
from app.services.badge_engine import safe_evaluate as _evaluate_badges

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _load_log_or_404(db: Session, log_id: UUID) -> RideLog:
    log = (
        db.query(RideLog)
        .options(
            selectinload(RideLog.media),
            selectinload(RideLog.rider),
            selectinload(RideLog.rating),
            selectinload(RideLog.ride_plan),
        )
        .filter(RideLog.id == log_id)
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="Ride log not found")
    return log


def _user_can_log_for_ride(db: Session, ride: RidePlan, user: User) -> bool:
    if ride.captain_id == user.id:
        return True
    return (
        db.query(RidePlanParticipant.id)
        .filter(
            RidePlanParticipant.ride_plan_id == ride.id,
            RidePlanParticipant.user_id == user.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .first()
        is not None
    )


def _require_owner(log: RideLog, user: User) -> None:
    if log.rider_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the rider who created this log can modify it",
        )


# ---------------------------------------------------------------------------
# Create (idempotent per-rider)
# ---------------------------------------------------------------------------
@router.post("", response_model=RideLogOut, status_code=201)
def create_ride_log(
    payload: RideLogCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RideLogOut:
    ride = (
        db.query(RidePlan).filter(RidePlan.id == payload.ride_plan_id).first()
    )
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.status == RidePlanStatus.cancelled:
        raise HTTPException(
            status_code=409,
            detail="Cannot log a cancelled ride",
        )
    if not _user_can_log_for_ride(db, ride, user):
        raise HTTPException(
            status_code=403,
            detail="Only approved participants (or the captain) can log this ride",
        )

    start_ts = payload.actual_start_ts or datetime.now(timezone.utc)

    # Atomic insert — on conflict (existing log for this rider + ride), do
    # nothing and fall through to the fetch below. This makes the endpoint
    # idempotent: the same rider POSTing twice gets the same row back without
    # mutating actual_start_ts (which they may have already adjusted via PATCH).
    stmt = (
        pg_insert(RideLog)
        .values(
            ride_plan_id=payload.ride_plan_id,
            rider_id=user.id,
            actual_start_ts=start_ts,
        )
        .on_conflict_do_nothing(constraint="uq_ride_log_ride_rider")
        .returning(RideLog.id)
    )
    inserted_id = db.execute(stmt).scalar_one_or_none()
    db.commit()

    if inserted_id is None:
        # Existing row — fetch it for the response.
        existing = (
            db.query(RideLog.id)
            .filter(
                RideLog.ride_plan_id == payload.ride_plan_id,
                RideLog.rider_id == user.id,
            )
            .first()
        )
        # The unique-constraint conflict guarantees the row exists, so the
        # ``existing is None`` branch is unreachable in normal operation.
        log_id = existing[0]  # type: ignore[index]
    else:
        log_id = inserted_id

    fresh = _load_log_or_404(db, log_id)

    # M8 side effect: a fresh ride log is the canonical "I finished this
    # ride" signal — drives rides_completed. May unlock first-ride,
    # rider-bronze/silver/gold, or star-rider (if the user already has
    # a 5-star rating). Idempotent on the existing-log path: re-posting
    # the same log just re-evaluates and inserts zero new badges.
    if inserted_id is not None:
        _evaluate_badges(db, user.id)

    return RideLogOut.model_validate(fresh)


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
@router.get("/{log_id}", response_model=RideLogOut)
def get_ride_log(
    log_id: UUID,
    db: Session = Depends(get_db),
    _user=Depends(get_optional_user),
) -> RideLogOut:
    log = _load_log_or_404(db, log_id)
    return RideLogOut.model_validate(log)


# ---------------------------------------------------------------------------
# Update (owner only)
# ---------------------------------------------------------------------------
@router.patch("/{log_id}", response_model=RideLogOut)
def update_ride_log(
    log_id: UUID,
    payload: RideLogUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RideLogOut:
    log = _load_log_or_404(db, log_id)
    _require_owner(log, user)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    db.commit()
    fresh = _load_log_or_404(db, log.id)
    return RideLogOut.model_validate(fresh)


# ---------------------------------------------------------------------------
# Cloudinary signed-upload params
# ---------------------------------------------------------------------------
@router.post("/{log_id}/media/sign", response_model=CloudinarySignature)
def sign_media_upload(
    log_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CloudinarySignature:
    log = _load_log_or_404(db, log_id)
    _require_owner(log, user)

    if not cloudinary_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail=(
                "Cloudinary is not configured on this server. Set "
                "CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / "
                "CLOUDINARY_API_SECRET in the backend .env to enable signed "
                "uploads, or POST media URLs directly to /api/ride-logs/{id}/media."
            ),
        )

    payload = cloudinary_service.sign_upload(
        folder=f"rydr/ride-logs/{log_id}",
    )
    return CloudinarySignature(ride_log_id=log_id, **payload)


# ---------------------------------------------------------------------------
# Confirm media (post-Cloudinary direct upload — or any https URL in dev)
# ---------------------------------------------------------------------------
@router.post("/{log_id}/media", response_model=RideMediaOut, status_code=201)
def confirm_media(
    log_id: UUID,
    payload: RideMediaConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RideMediaOut:
    log = _load_log_or_404(db, log_id)
    _require_owner(log, user)

    # Phase 4 W3: derive a poster frame for video (and a resized variant for
    # images) from the delivery URL. A client-supplied thumbnail_url wins, so
    # a caller that already knows the poster — or is not using Cloudinary —
    # can set it explicitly. Returns None for non-Cloudinary URLs, in which
    # case the column stays null and the client renders the original.
    thumbnail = payload.thumbnail_url or media_urls.derive_thumbnail(
        payload.url, payload.media_type
    )

    media = RideMedia(
        ride_log_id=log.id,
        url=payload.url,
        media_type=payload.media_type,
        uploaded_by_user_id=user.id,
        caption=payload.caption,
        thumbnail_url=thumbnail,
    )
    db.add(media)

    # Flywheel: same transaction, write a DestinationMedia row pointing at
    # the same URL. If we crash mid-way, both rolls back — no orphaned link.
    if payload.link_to_destination and log.ride_plan is not None:
        db.add(
            DestinationMedia(
                destination_id=log.ride_plan.destination_id,
                url=payload.url,
                caption=payload.caption,
                thumbnail_url=thumbnail,
                uploaded_by_user_id=user.id,
                ride_log_id=log.id,
            )
        )

    db.commit()
    db.refresh(media)
    return RideMediaOut.model_validate(media)


# ---------------------------------------------------------------------------
# Delete media row (does NOT touch Cloudinary — see M4 plan out-of-scope)
# ---------------------------------------------------------------------------
@router.delete("/{log_id}/media/{media_id}")
def delete_media(
    log_id: UUID,
    media_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    log = _load_log_or_404(db, log_id)
    _require_owner(log, user)

    media = (
        db.query(RideMedia)
        .filter(RideMedia.id == media_id, RideMedia.ride_log_id == log_id)
        .first()
    )
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    # Also unlink the matching DestinationMedia row(s) that point at this
    # ride_log. Deleting them keeps the destination gallery consistent with
    # the rider's intent ("I removed that photo").
    db.query(DestinationMedia).filter(
        DestinationMedia.ride_log_id == log_id,
        DestinationMedia.url == media.url,
    ).delete(synchronize_session=False)

    db.delete(media)
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Ride summary — the data behind a share card (Phase 4 W4)
# ---------------------------------------------------------------------------
@router.get("/{log_id}/summary", response_model=RideSummary)
def ride_summary(
    log_id: UUID,
    db: Session = Depends(get_db),
) -> RideSummary:
    """Flat, pre-formatted facts about one logged ride.

    Public, like the rest of the ride-log read surface (Phase 3 decided
    "everything public"), which also means a share card can be rendered for a
    link recipient who has no Rydr account — the point of a share card.

    Every value is computed here rather than in the renderer, so the web card,
    the Android card and any future consumer show the same numbers.
    """
    row = (
        db.query(RideLog, RidePlan, Destination, User)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .join(Destination, Destination.id == RidePlan.destination_id)
        .join(User, User.id == RideLog.rider_id)
        .options(selectinload(RideLog.media))
        .filter(RideLog.id == log_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Ride log not found")

    log, ride, dest, rider = row

    duration = None
    if log.actual_start_ts and log.actual_end_ts:
        delta = log.actual_end_ts - log.actual_start_ts
        # Guard against a log whose end precedes its start (clock skew on the
        # client, or a manual edit). A negative duration on a share card is
        # worse than no duration at all.
        minutes = int(delta.total_seconds() // 60)
        duration = minutes if minutes >= 0 else None

    rider_count = (
        db.query(func.count(RidePlanParticipant.id))
        .filter(
            RidePlanParticipant.ride_plan_id == ride.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .scalar()
        or 0
    )

    stars = (
        db.query(Rating.stars)
        .filter(Rating.ride_log_id == log.id, Rating.user_id == rider.id)
        .scalar()
    )

    return RideSummary(
        ride_log_id=log.id,
        ride_plan_id=ride.id,
        rider_name=rider.name,
        rider_avatar_url=rider.avatar_url,
        destination_id=dest.id,
        destination_name=dest.name,
        destination_region=dest.region,
        ride_title=ride.title,
        ride_date=ride.planned_date,
        estimated_distance_km=stats.estimated_ride_km(
            rider.home_latitude, rider.home_longitude, dest.latitude, dest.longitude
        ),
        duration_minutes=duration,
        actual_cost=log.actual_cost,
        road_condition=log.road_condition,
        recommended=log.recommended,
        rider_count=rider_count,
        photo_count=len(log.media),
        stars=stars,
    )
