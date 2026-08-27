"""Share-card endpoints — Phase 4 W4.

  GET /api/share-cards/rides/{ride_log_id}.svg
  GET /api/share-cards/badges/{user_badge_id}.svg

Both are public and both return ``image/svg+xml``. Public is the requirement,
not an oversight: a card exists to be pasted into WhatsApp or Instagram, where
the viewer has no Rydr session and often no Rydr account.

Caching
-------
The plan asks to "cache / optimize generated card images". Rendering is pure
string composition over a handful of already-indexed rows, so a server-side
image cache would add invalidation work to save well under a millisecond.
What actually costs something is the round trip, so caching is pushed to the
edge with ``Cache-Control`` and a strong ``ETag``:

- The ETag is a hash of the rendered bytes, so it changes exactly when the
  card changes — a rider editing their log's cost invalidates it, a rider
  editing an unrelated post does not.
- ``If-None-Match`` is honoured with a 304, so a card embedded in a feed or
  re-fetched by a chat app's link unfurler transfers no body at all.
- ``max-age`` is deliberately short with a long ``stale-while-revalidate``:
  ride details can be edited after the fact, and serving a week-old card
  showing the wrong cost is worse than a revalidation request.

Content-Disposition
-------------------
``?download=1`` switches to an attachment disposition with a filename derived
from the destination, for the "download the card" flow. Without it the card
renders inline, which is what an ``<img src>`` and a link unfurler need.
"""
from __future__ import annotations

import hashlib
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.badge import Badge, UserBadge
from app.models.destination import Destination, Rating
from app.models.ride import ParticipantStatus, RidePlan, RidePlanParticipant
from app.models.ride_log import RideLog
from app.models.user import User
from app.services import share_cards, stats
from sqlalchemy import func

router = APIRouter()

# Short freshness window, long grace period. See module docstring.
_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400"


def _slugify(value: str) -> str:
    """Filename-safe slug for the download disposition.

    Restricted to an explicit allowlist rather than merely stripping known-bad
    characters: this value lands in a Content-Disposition header, where a
    stray quote or newline injected via a destination name would let a
    submitter control response headers.
    """
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value or "").strip("-").lower()
    return (slug or "rydr")[:48]


def _svg_response(
    request: Request, svg: str, *, filename: str, download: bool
) -> Response:
    """Return the SVG with validators, honouring If-None-Match."""
    etag = '"%s"' % hashlib.sha256(svg.encode("utf-8")).hexdigest()[:32]

    headers = {"Cache-Control": _CACHE_CONTROL, "ETag": etag}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{filename}.svg"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{filename}.svg"'

    # A conditional request that still matches costs no body. The header can
    # carry a list of validators, so test membership rather than equality.
    inm = request.headers.get("if-none-match")
    if inm and etag in {tag.strip() for tag in inm.split(",")}:
        return Response(status_code=304, headers=headers)

    return Response(content=svg, media_type="image/svg+xml", headers=headers)


@router.get("/rides/{ride_log_id}.svg")
def ride_card(
    ride_log_id: UUID,
    request: Request,
    download: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> Response:
    row = (
        db.query(RideLog, RidePlan, Destination, User)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .join(Destination, Destination.id == RidePlan.destination_id)
        .join(User, User.id == RideLog.rider_id)
        .filter(RideLog.id == ride_log_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Ride log not found")
    log, ride, dest, rider = row

    duration = None
    if log.actual_start_ts and log.actual_end_ts:
        minutes = int((log.actual_end_ts - log.actual_start_ts).total_seconds() // 60)
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
    star_rating = (
        db.query(Rating.stars)
        .filter(Rating.ride_log_id == log.id, Rating.user_id == rider.id)
        .scalar()
    )

    origin: Optional[tuple[float, float]] = None
    if rider.home_latitude is not None and rider.home_longitude is not None:
        origin = (rider.home_latitude, rider.home_longitude)

    svg = share_cards.render_ride_card(
        rider_name=rider.name,
        destination_name=dest.name,
        destination_region=dest.region,
        ride_date=ride.planned_date.isoformat(),
        distance_km=stats.estimated_ride_km(
            rider.home_latitude, rider.home_longitude, dest.latitude, dest.longitude
        ),
        duration_minutes=duration,
        rider_count=rider_count,
        stars=star_rating,
        origin=origin,
        destination_coords=(dest.latitude, dest.longitude),
    )
    return _svg_response(
        request,
        svg,
        filename=f"rydr-{_slugify(dest.name)}",
        download=download,
    )


@router.get("/badges/{user_badge_id}.svg")
def badge_card(
    user_badge_id: UUID,
    request: Request,
    download: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> Response:
    row = (
        db.query(UserBadge, Badge, User)
        .join(Badge, Badge.id == UserBadge.badge_id)
        .join(User, User.id == UserBadge.user_id)
        .filter(UserBadge.id == user_badge_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Badge award not found")
    award, badge, rider = row

    svg = share_cards.render_badge_card(
        rider_name=rider.name,
        badge_name=badge.name,
        badge_description=badge.description,
        earned_at=award.earned_at.date().isoformat(),
    )
    return _svg_response(
        request,
        svg,
        filename=f"rydr-badge-{_slugify(badge.slug)}",
        download=download,
    )
