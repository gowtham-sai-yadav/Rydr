"""Destinations router — M2 core of the discovery loop.

Endpoints:
  GET    /                       — filtered, sorted, paginated list
  POST   /                       — submit a new destination (auth)
  GET    /{id}                   — detail w/ tags, media, rating aggregates, recent riders
  GET    /{id}/media             — paginated media
  GET    /{id}/ratings           — paginated ratings
  POST   /{id}/ratings           — create or upsert (1 per user); recomputes avg + count (auth)
  GET    /{id}/cost-estimate     — per-user cost estimate (uses auth'd user's bike + home if available)

Notes:
  - Auth is *optional* on GETs so personalization (home location, mileage) layers
    in for logged-in users without blocking public browsing.
  - Distance filter / distance sort uses an inline Haversine in SQL — Postgres
    `acos / cos / sin / radians`, clamped via `least(1, greatest(-1, ...))` to
    survive float overshoot. PostGIS deferred to the M11 GPS stretch (see
    PHASE3_PLAN.md §11).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Float, and_, cast, distinct, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.destination import (
    Destination,
    DestinationMedia,
    DestinationTag,
    Rating,
    Tag,
    TagCategory,
)
from app.models.ride import RidePlan
from app.models.ride_log import RideLog
from app.models.user import User
from app.schemas.destination import (
    CostEstimate,
    DestinationCreate,
    DestinationListResponse,
    DestinationMediaListResponse,
    DestinationMediaOut,
    DestinationOut,
    DestinationSummary,
    RatingCreate,
    RatingListResponse,
    RatingOut,
    TagOut,
)
from app.schemas.ride import UserBrief
from app.services.cost_calculator import estimate_cost
from app.services.geo import haversine_km

router = APIRouter()


EARTH_RADIUS_KM = 6371.0088
RECENT_WINDOW_DAYS = 90
RECENT_RIDER_PREVIEW = 3


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _haversine_sql(origin_lat: float, origin_lng: float):
    """Inline Haversine distance (km) expression for use in WHERE / ORDER BY."""
    lat1 = func.radians(cast(origin_lat, Float))
    lng1 = func.radians(cast(origin_lng, Float))
    lat2 = func.radians(Destination.latitude)
    lng2 = func.radians(Destination.longitude)
    inner = (
        func.cos(lat1) * func.cos(lat2) * func.cos(lng2 - lng1)
        + func.sin(lat1) * func.sin(lat2)
    )
    # Clamp to [-1, 1] so acos() never explodes on rounding error.
    clamped = func.least(1.0, func.greatest(-1.0, inner))
    return EARTH_RADIUS_KM * func.acos(clamped)


def _resolve_origin(
    from_lat: Optional[float],
    from_lng: Optional[float],
    user: Optional[User],
) -> Optional[tuple[float, float]]:
    """Explicit override > user's home > None. Both coords must be present."""
    if from_lat is not None and from_lng is not None:
        return (from_lat, from_lng)
    if user and user.home_latitude is not None and user.home_longitude is not None:
        return (user.home_latitude, user.home_longitude)
    return None


def _recent_riders(
    db: Session, destination_id: UUID
) -> tuple[int, List[UserBrief]]:
    """Distinct rider count + up to N most recent UserBriefs for a destination.

    A ride is "at" a destination when its RidePlan targets that destination AND
    a RideLog exists with actual_end_ts in the recent window.
    """
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_WINDOW_DAYS)

    count = (
        db.query(func.count(distinct(RideLog.rider_id)))
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RidePlan.destination_id == destination_id,
            RideLog.actual_end_ts.isnot(None),
            RideLog.actual_end_ts >= since,
        )
        .scalar()
        or 0
    )

    preview_rows = (
        db.query(User)
        .join(RideLog, RideLog.rider_id == User.id)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RidePlan.destination_id == destination_id,
            RideLog.actual_end_ts.isnot(None),
            RideLog.actual_end_ts >= since,
        )
        .order_by(RideLog.actual_end_ts.desc())
        .limit(RECENT_RIDER_PREVIEW)
        .all()
    )
    return count, [UserBrief.model_validate(u) for u in preview_rows]


def _recompute_rating_aggregates(db: Session, destination: Destination) -> None:
    agg = (
        db.query(func.avg(Rating.stars), func.count(Rating.id))
        .filter(Rating.destination_id == destination.id)
        .one()
    )
    avg, count = agg
    destination.avg_rating = float(avg) if avg is not None else 0.0
    destination.rating_count = int(count or 0)


def _serialize_detail(
    db: Session, destination: Destination
) -> DestinationOut:
    """Build DestinationOut directly — `destination.tags` is an association
    table (DestinationTag), so we project through `.tag` instead of relying
    on Pydantic's ``from_attributes`` walk."""
    recent_count, recent_users = _recent_riders(db, destination.id)
    return DestinationOut(
        id=destination.id,
        name=destination.name,
        description=destination.description,
        region=destination.region,
        country=destination.country,
        currency=destination.currency,
        latitude=destination.latitude,
        longitude=destination.longitude,
        terrain_difficulty=destination.terrain_difficulty,
        estimated_food_cost=destination.estimated_food_cost,
        estimated_entry_cost=destination.estimated_entry_cost,
        best_season=destination.best_season,
        best_time_of_day=destination.best_time_of_day,
        hero_media_url=destination.hero_media_url,
        avg_rating=destination.avg_rating,
        rating_count=destination.rating_count,
        submitted_by_user_id=destination.submitted_by_user_id,
        created_at=destination.created_at,
        updated_at=destination.updated_at,
        tags=[TagOut.model_validate(dt.tag) for dt in destination.tags],
        media=[DestinationMediaOut.model_validate(m) for m in destination.media],
        recent_rider_count=recent_count,
        recent_riders=recent_users,
    )


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------
@router.get("", response_model=DestinationListResponse)
def list_destinations(
    tags: Optional[List[str]] = Query(default=None),
    vehicle_fit: Optional[List[str]] = Query(default=None),
    radius_km: Optional[float] = Query(default=None, ge=0),
    from_lat: Optional[float] = Query(default=None, ge=-90, le=90),
    from_lng: Optional[float] = Query(default=None, ge=-180, le=180),
    max_budget: Optional[int] = Query(default=None, ge=0),
    q: Optional[str] = Query(default=None, max_length=200),
    sort: str = Query(default="rating", pattern="^(rating|distance|popularity)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
) -> DestinationListResponse:
    origin = _resolve_origin(from_lat, from_lng, user)

    if sort == "distance" and origin is None:
        raise HTTPException(
            status_code=400,
            detail="sort=distance requires from_lat+from_lng or an authenticated user with home location",
        )
    if radius_km is not None and origin is None:
        raise HTTPException(
            status_code=400,
            detail="radius_km requires from_lat+from_lng or an authenticated user with home location",
        )

    query = db.query(Destination)

    if tags:
        query = query.filter(
            exists().where(
                and_(
                    DestinationTag.destination_id == Destination.id,
                    DestinationTag.tag_id == Tag.id,
                    Tag.slug.in_(tags),
                    Tag.category == TagCategory.vibe,
                )
            )
        )

    if vehicle_fit:
        query = query.filter(
            exists().where(
                and_(
                    DestinationTag.destination_id == Destination.id,
                    DestinationTag.tag_id == Tag.id,
                    Tag.slug.in_(vehicle_fit),
                    Tag.category == TagCategory.vehicle_fit,
                )
            )
        )

    if max_budget is not None:
        budget_expr = func.coalesce(Destination.estimated_food_cost, 0) + func.coalesce(
            Destination.estimated_entry_cost, 0
        )
        query = query.filter(budget_expr <= max_budget)

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Destination.name.ilike(like), Destination.region.ilike(like))
        )

    distance_expr = None
    if origin is not None:
        distance_expr = _haversine_sql(origin[0], origin[1])
        if radius_km is not None:
            query = query.filter(distance_expr <= radius_km)

    total = query.with_entities(func.count(Destination.id)).scalar() or 0

    if sort == "rating":
        query = query.order_by(
            Destination.avg_rating.desc(), Destination.rating_count.desc()
        )
    elif sort == "popularity":
        query = query.order_by(
            Destination.rating_count.desc(), Destination.avg_rating.desc()
        )
    elif sort == "distance":
        query = query.order_by(distance_expr.asc())

    rows = query.offset((page - 1) * limit).limit(limit).all()

    summaries: List[DestinationSummary] = []
    for dest in rows:
        s = DestinationSummary.model_validate(dest)
        if origin is not None:
            s.distance_km = round(
                haversine_km(origin[0], origin[1], dest.latitude, dest.longitude), 1
            )
        summaries.append(s)

    return DestinationListResponse(
        destinations=summaries, total=total, page=page, limit=limit
    )


# ---------------------------------------------------------------------------
# Submit
# ---------------------------------------------------------------------------
@router.post("", response_model=DestinationOut, status_code=201)
def create_destination(
    payload: DestinationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DestinationOut:
    dest = Destination(
        name=payload.name,
        description=payload.description,
        region=payload.region,
        country=payload.country,
        currency=payload.currency,
        latitude=payload.latitude,
        longitude=payload.longitude,
        terrain_difficulty=payload.terrain_difficulty,
        estimated_food_cost=payload.estimated_food_cost,
        estimated_entry_cost=payload.estimated_entry_cost,
        best_season=payload.best_season,
        best_time_of_day=payload.best_time_of_day,
        hero_media_url=payload.hero_media_url,
        submitted_by_user_id=user.id,
    )
    db.add(dest)
    db.flush()

    if payload.tag_slugs:
        tag_rows = db.query(Tag).filter(Tag.slug.in_(payload.tag_slugs)).all()
        found = {t.slug for t in tag_rows}
        missing = set(payload.tag_slugs) - found
        if missing:
            raise HTTPException(
                status_code=400, detail=f"Unknown tag slugs: {sorted(missing)}"
            )
        for tag in tag_rows:
            db.add(DestinationTag(destination_id=dest.id, tag_id=tag.id))

    for url in payload.gallery_urls:
        db.add(DestinationMedia(destination_id=dest.id, url=url, uploaded_by_user_id=user.id))

    db.commit()
    db.refresh(dest)
    return _serialize_detail(db, dest)


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
def _load_destination_or_404(db: Session, destination_id: UUID) -> Destination:
    dest = (
        db.query(Destination)
        .options(
            selectinload(Destination.tags).selectinload(DestinationTag.tag),
            selectinload(Destination.media),
        )
        .filter(Destination.id == destination_id)
        .first()
    )
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")
    return dest


@router.get("/{destination_id}", response_model=DestinationOut)
def get_destination(
    destination_id: UUID,
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> DestinationOut:
    dest = _load_destination_or_404(db, destination_id)
    return _serialize_detail(db, dest)


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------
@router.get("/{destination_id}/media", response_model=DestinationMediaListResponse)
def list_destination_media(
    destination_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> DestinationMediaListResponse:
    if not db.query(Destination.id).filter(Destination.id == destination_id).first():
        raise HTTPException(status_code=404, detail="Destination not found")

    base = db.query(DestinationMedia).filter(
        DestinationMedia.destination_id == destination_id
    )
    total = base.with_entities(func.count(DestinationMedia.id)).scalar() or 0
    rows = (
        base.order_by(DestinationMedia.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return DestinationMediaListResponse(
        media=[DestinationMediaOut.model_validate(m) for m in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Ratings
# ---------------------------------------------------------------------------
@router.get("/{destination_id}/ratings", response_model=RatingListResponse)
def list_ratings(
    destination_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
) -> RatingListResponse:
    if not db.query(Destination.id).filter(Destination.id == destination_id).first():
        raise HTTPException(status_code=404, detail="Destination not found")

    base = db.query(Rating).filter(Rating.destination_id == destination_id)
    total = base.with_entities(func.count(Rating.id)).scalar() or 0
    rows = (
        base.options(selectinload(Rating.user))
        .order_by(Rating.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return RatingListResponse(
        ratings=[RatingOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        limit=limit,
    )


@router.post("/{destination_id}/ratings", response_model=RatingOut, status_code=201)
def create_or_update_rating(
    destination_id: UUID,
    payload: RatingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RatingOut:
    dest = (
        db.query(Destination).filter(Destination.id == destination_id).first()
    )
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")

    rating = (
        db.query(Rating)
        .filter(
            Rating.destination_id == destination_id,
            Rating.user_id == user.id,
        )
        .first()
    )
    if rating:
        rating.stars = payload.stars
        rating.review = payload.review
        if payload.ride_log_id is not None:
            rating.ride_log_id = payload.ride_log_id
    else:
        rating = Rating(
            destination_id=destination_id,
            user_id=user.id,
            stars=payload.stars,
            review=payload.review,
            ride_log_id=payload.ride_log_id,
        )
        db.add(rating)

    db.flush()
    _recompute_rating_aggregates(db, dest)
    db.commit()
    db.refresh(rating)
    return RatingOut.model_validate(rating)


# ---------------------------------------------------------------------------
# Cost estimate
# ---------------------------------------------------------------------------
@router.get("/{destination_id}/cost-estimate", response_model=CostEstimate)
def cost_estimate(
    destination_id: UUID,
    from_lat: Optional[float] = Query(default=None, ge=-90, le=90),
    from_lng: Optional[float] = Query(default=None, ge=-180, le=180),
    bike_mileage_kmpl: Optional[float] = Query(default=None, gt=0),
    fuel_price: Optional[float] = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
) -> CostEstimate:
    dest = (
        db.query(Destination).filter(Destination.id == destination_id).first()
    )
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")

    origin = _resolve_origin(from_lat, from_lng, user)
    if origin is None:
        raise HTTPException(
            status_code=400,
            detail="Provide from_lat+from_lng or authenticate with a home location set",
        )

    mileage = bike_mileage_kmpl
    if mileage is None and user and user.bike and user.bike.mileage_kmpl:
        mileage = user.bike.mileage_kmpl

    distance = haversine_km(origin[0], origin[1], dest.latitude, dest.longitude)
    return estimate_cost(
        destination=dest,
        distance_km=distance,
        bike_mileage_kmpl=mileage,
        fuel_price_inr_per_l=fuel_price,
    )
