"""Destinations router — M2 core of the discovery loop.

Endpoints:
  GET    /                       — filtered, sorted, paginated list
  POST   /                       — submit a new destination (auth)
  GET    /{id}                   — detail w/ tags, media, rating aggregates, recent riders
  GET    /{id}/media             — paginated media
  GET    /{id}/ratings           — paginated ratings
  POST   /{id}/ratings           — atomic upsert (1 per user); recomputes avg + count (auth)
  GET    /{id}/cost-estimate     — per-user cost estimate (uses auth'd user's bike + home if available)

Notes:
  - Auth is *optional* on GETs so personalization (home location, mileage) layers
    in for logged-in users without blocking public browsing.
  - Multi-tag filters use OR semantics ("any of the supplied slugs") per the
    finalized M2 plan; unknown slugs 400 so frontend bugs surface loudly.
  - Currency is enforced to INR at submit time until multi-currency lands
    (cost calculator assumes INR fuel pricing).
  - Pagination uses a stable ``Destination.id`` tiebreaker on every list query
    so ties don't shuffle across pages.
  - Rating upsert uses Postgres ``ON CONFLICT`` to be safe under concurrent
    double-submits; aggregate recompute runs as a single ``UPDATE`` in the
    same transaction so ``avg_rating`` / ``rating_count`` never drift.

Note for M9: ``_build_detail_response`` enumerates ``DestinationOut`` fields
by hand because ``destination.tags`` returns ``DestinationTag`` association
objects, not ``Tag`` rows — so ``DestinationOut.model_validate(destination)``
does not work without restructuring the relationships. New columns on
``Destination`` must be added here too until that refactor.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
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
from app.schemas.user import UserBrief
from app.services.cost_calculator import estimate_cost
from app.services.geo import haversine_km, haversine_sql_expression

router = APIRouter()


RECENT_WINDOW_DAYS = 90
RECENT_RIDER_PREVIEW = 3
SUPPORTED_CURRENCIES = {"INR"}  # cost calculator is INR-only until multi-currency lands
MIN_SEARCH_LEN = 2
LIKE_ESCAPE_CHAR = "\\"


def _escape_like(s: str) -> str:
    """Escape ILIKE wildcards so user input cannot match arbitrary patterns.

    Without this, ``q="%"`` becomes ILIKE ``%%%`` and matches every row, and
    ``q="A_B"`` matches ``AaB`` / ``AbB`` etc. instead of literal ``A_B``.
    """
    return (
        s.replace(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR * 2)
        .replace("%", LIKE_ESCAPE_CHAR + "%")
        .replace("_", LIKE_ESCAPE_CHAR + "_")
    )


def _clean_slug_list(slugs: Optional[List[str]]) -> List[str]:
    """FastAPI parses ``?tags=`` (empty value) as ``[""]``; strip those out
    along with whitespace-only entries so a malformed query is treated as
    "no filter" instead of "match the empty slug" (which always returns 0
    rows)."""
    if not slugs:
        return []
    return [s.strip() for s in slugs if s and s.strip()]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
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


def _validate_slugs_exist(
    db: Session, slugs: List[str], category: Optional[TagCategory] = None
) -> None:
    """Raise 400 if any slug doesn't match an existing Tag (optionally
    in the given category). Used for filter inputs so a typo doesn't
    silently return the unfiltered set."""
    if not slugs:
        return
    q = db.query(Tag.slug).filter(Tag.slug.in_(slugs))
    if category is not None:
        q = q.filter(Tag.category == category)
    found = {row[0] for row in q.all()}
    missing = sorted(set(slugs) - found)
    if missing:
        cat_label = f" in category {category.value}" if category else ""
        raise HTTPException(
            status_code=400,
            detail=f"Unknown tag slugs{cat_label}: {missing}",
        )


def _recent_riders(
    db: Session, destination_id: UUID
) -> tuple[int, List[UserBrief]]:
    """Distinct rider count + N most recent UserBriefs for a destination.

    A ride is "at" a destination when its RidePlan targets that destination AND
    a RideLog exists with actual_end_ts in the recent window. The preview is
    deduped per ``rider_id`` so a power-user with multiple completed rides
    appears only once.
    """
    since = datetime.now(timezone.utc) - timedelta(days=RECENT_WINDOW_DAYS)

    count = (
        db.query(func.count(func.distinct(RideLog.rider_id)))
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RidePlan.destination_id == destination_id,
            RideLog.actual_end_ts.isnot(None),
            RideLog.actual_end_ts >= since,
        )
        .scalar()
        or 0
    )

    # One row per rider — the most-recent end timestamp — ordered by recency.
    latest_per_rider = (
        db.query(
            RideLog.rider_id.label("rider_id"),
            func.max(RideLog.actual_end_ts).label("latest_end"),
        )
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RidePlan.destination_id == destination_id,
            RideLog.actual_end_ts.isnot(None),
            RideLog.actual_end_ts >= since,
        )
        .group_by(RideLog.rider_id)
        .order_by(func.max(RideLog.actual_end_ts).desc())
        .limit(RECENT_RIDER_PREVIEW)
        .subquery()
    )

    preview_rows = (
        db.query(User)
        .join(latest_per_rider, User.id == latest_per_rider.c.rider_id)
        .order_by(latest_per_rider.c.latest_end.desc())
        .all()
    )
    return count, [UserBrief.model_validate(u) for u in preview_rows]


def _build_detail_response(
    db: Session, destination: Destination
) -> DestinationOut:
    """See module-level note re: manual field enumeration and tag association."""
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

    # Drop empty-string entries that FastAPI parses from ``?tags=`` and trim
    # whitespace before slug validation.
    tags = _clean_slug_list(tags)
    vehicle_fit = _clean_slug_list(vehicle_fit)

    # Surface bad slugs loudly — easier to debug than silently empty filters.
    _validate_slugs_exist(db, tags, TagCategory.vibe)
    _validate_slugs_exist(db, vehicle_fit, TagCategory.vehicle_fit)

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
        q_stripped = q.strip()
        # Treat blank / too-short / pure-wildcard inputs as "no search" rather
        # than scanning the whole table for an empty pattern.
        if len(q_stripped) >= MIN_SEARCH_LEN:
            escaped = _escape_like(q_stripped)
            like = f"%{escaped}%"
            query = query.filter(
                or_(
                    Destination.name.ilike(like, escape=LIKE_ESCAPE_CHAR),
                    Destination.region.ilike(like, escape=LIKE_ESCAPE_CHAR),
                )
            )

    distance_expr = None
    if origin is not None:
        distance_expr = haversine_sql_expression(
            origin[0], origin[1], Destination.latitude, Destination.longitude
        )
        if radius_km is not None:
            query = query.filter(distance_expr <= radius_km)

    total = query.with_entities(func.count(Destination.id)).scalar() or 0

    if sort == "rating":
        query = query.order_by(
            Destination.avg_rating.desc(),
            Destination.rating_count.desc(),
            Destination.id.asc(),
        )
    elif sort == "popularity":
        query = query.order_by(
            Destination.rating_count.desc(),
            Destination.avg_rating.desc(),
            Destination.id.asc(),
        )
    elif sort == "distance":
        query = query.order_by(distance_expr.asc(), Destination.id.asc())

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
    if payload.currency not in SUPPORTED_CURRENCIES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"currency={payload.currency} not supported yet — only "
                f"{sorted(SUPPORTED_CURRENCIES)} (M2 cost calculator is INR-only)."
            ),
        )

    # Resolve + validate tags BEFORE any write so a bad payload doesn't
    # flush a Destination row that then has to roll back.
    if payload.tag_slugs:
        tag_rows = db.query(Tag).filter(Tag.slug.in_(payload.tag_slugs)).all()
        found = {t.slug for t in tag_rows}
        missing = sorted(set(payload.tag_slugs) - found)
        if missing:
            raise HTTPException(
                status_code=400, detail=f"Unknown tag slugs: {missing}"
            )
    else:
        tag_rows = []

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

    for tag in tag_rows:
        db.add(DestinationTag(destination_id=dest.id, tag_id=tag.id))

    for url in payload.gallery_urls:
        db.add(
            DestinationMedia(
                destination_id=dest.id, url=url, uploaded_by_user_id=user.id
            )
        )

    db.commit()
    # Re-fetch with eager loaders so _build_detail_response doesn't lazy-walk
    # tags + media (was N+1 under db.refresh which discards loader options).
    fresh = _load_destination_or_404(db, dest.id)
    return _build_detail_response(db, fresh)


# ---------------------------------------------------------------------------
# Detail
# ---------------------------------------------------------------------------
@router.get("/{destination_id}", response_model=DestinationOut)
def get_destination(
    destination_id: UUID,
    db: Session = Depends(get_db),
    _user: Optional[User] = Depends(get_optional_user),
) -> DestinationOut:
    dest = _load_destination_or_404(db, destination_id)
    return _build_detail_response(db, dest)


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
        base.order_by(
            DestinationMedia.created_at.desc(), DestinationMedia.id.asc()
        )
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
        .order_by(Rating.created_at.desc(), Rating.id.asc())
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
    if not db.query(Destination.id).filter(Destination.id == destination_id).first():
        raise HTTPException(status_code=404, detail="Destination not found")

    # Atomic upsert keyed on uq_rating_destination_user — two concurrent
    # POSTs from the same user no longer race into IntegrityError.
    insert_stmt = (
        pg_insert(Rating)
        .values(
            destination_id=destination_id,
            user_id=user.id,
            stars=payload.stars,
            review=payload.review,
            ride_log_id=payload.ride_log_id,
        )
        .on_conflict_do_update(
            constraint="uq_rating_destination_user",
            set_=dict(
                stars=payload.stars,
                review=payload.review,
                ride_log_id=payload.ride_log_id,
                updated_at=func.now(),
            ),
        )
        .returning(Rating.id)
    )
    rating_id = db.execute(insert_stmt).scalar_one()

    # Recompute aggregates in the same transaction via a single UPDATE
    # whose subqueries read the post-upsert state — eliminates the
    # check-then-write window the audit flagged.
    avg_subq = (
        select(func.coalesce(func.avg(Rating.stars), 0.0))
        .where(Rating.destination_id == destination_id)
        .scalar_subquery()
    )
    count_subq = (
        select(func.count(Rating.id))
        .where(Rating.destination_id == destination_id)
        .scalar_subquery()
    )
    db.execute(
        update(Destination)
        .where(Destination.id == destination_id)
        .values(avg_rating=avg_subq, rating_count=count_subq)
    )
    db.commit()

    # Re-fetch with user eager-loaded so the response build doesn't lazy-load.
    rating = (
        db.query(Rating)
        .options(selectinload(Rating.user))
        .filter(Rating.id == rating_id)
        .one()
    )
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
