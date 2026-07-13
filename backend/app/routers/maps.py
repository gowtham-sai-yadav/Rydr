"""Maps, routing and geocoding — Phase 4 W2.

  GET /api/maps/config                    — tile URL + attribution for the client
  GET /api/maps/route                     — road route between two points
  GET /api/maps/geocode                   — free-text place search
  GET /api/maps/pins                      — destination pins in a bounding box

All read-only and all public: map browsing is the discovery surface the plan
positions for logged-out visitors.

The routing and geocoding endpoints are thin proxies over the active provider
rather than direct client-to-vendor calls. Three reasons, all of which apply
to OSM today and would apply harder to Mapbox: an API token would otherwise
have to ship to the browser, the in-process route cache only helps if calls
funnel through one place, and the usage-policy User-Agent can be set
consistently for every request.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.destination import Destination
from app.schemas.maps import (
    DestinationPin,
    GeocodeHit,
    GeocodeResponse,
    MapConfigOut,
    MapPinsResponse,
    RouteOut,
)
from app.services import maps

router = APIRouter()

# Hard ceiling on pins per request. A world-view query would otherwise stream
# every destination in the database into a browser that can only usefully
# cluster a few hundred.
MAX_PINS = 500


@router.get("/config", response_model=MapConfigOut)
def map_config() -> MapConfigOut:
    """Everything a client needs to render a slippy map.

    Served from the API rather than hardcoded in the frontend so switching
    providers does not require a frontend deploy, and so the attribution
    string travels with the tile URL it belongs to.
    """
    cfg = maps.get_provider().tile_config()
    return MapConfigOut(
        provider=cfg.provider,
        tile_url=cfg.tile_url,
        attribution=cfg.attribution,
        max_zoom=cfg.max_zoom,
        access_token=cfg.access_token,
    )


@router.get("/route", response_model=RouteOut)
def route(
    from_lat: float = Query(..., ge=-90, le=90),
    from_lng: float = Query(..., ge=-180, le=180),
    to_lat: float = Query(..., ge=-90, le=90),
    to_lng: float = Query(..., ge=-180, le=180),
) -> RouteOut:
    """Road route between two coordinates.

    Never fails on upstream trouble: if the router is unreachable the response
    carries a straight-line approximation with ``is_estimate: true`` and an
    empty geometry, so the client shows a distance but does not draw a road
    that was never computed.
    """
    result = maps.get_provider().route((from_lat, from_lng), (to_lat, to_lng))
    return RouteOut(
        origin=(from_lat, from_lng),
        destination=(to_lat, to_lng),
        distance_km=result.distance_km,
        duration_minutes=result.duration_minutes,
        geometry=result.geometry,
        is_estimate=result.is_estimate,
        provider=result.provider,
    )


@router.get("/destinations/{destination_id}/route", response_model=RouteOut)
def route_to_destination(
    destination_id: UUID,
    from_lat: float = Query(..., ge=-90, le=90),
    from_lng: float = Query(..., ge=-180, le=180),
    db: Session = Depends(get_db),
) -> RouteOut:
    """Route preview from a given origin to a destination.

    The origin is a parameter rather than being read from the caller's saved
    home location, because this endpoint is public and the common case is
    previewing a route before deciding whether to sign up.
    """
    dest = (
        db.query(Destination.latitude, Destination.longitude)
        .filter(Destination.id == destination_id)
        .first()
    )
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")

    result = maps.get_provider().route(
        (from_lat, from_lng), (dest.latitude, dest.longitude)
    )
    return RouteOut(
        origin=(from_lat, from_lng),
        destination=(dest.latitude, dest.longitude),
        distance_km=result.distance_km,
        duration_minutes=result.duration_minutes,
        geometry=result.geometry,
        is_estimate=result.is_estimate,
        provider=result.provider,
    )


@router.get("/geocode", response_model=GeocodeResponse)
def geocode(
    q: str = Query(..., min_length=2, max_length=200),
    limit: int = Query(default=5, ge=1, le=10),
) -> GeocodeResponse:
    """Free-text place search, for setting a home location or finding a spot.

    Returns an empty result list rather than an error when the upstream is
    unavailable — a search box that shows "no matches" degrades better than
    one that shows a server error.
    """
    hits = maps.get_provider().geocode(q, limit=limit)
    return GeocodeResponse(
        query=q,
        results=[
            GeocodeHit(
                name=h.name, latitude=h.latitude, longitude=h.longitude, kind=h.kind
            )
            for h in hits
        ],
    )


@router.get("/pins", response_model=MapPinsResponse)
def pins(
    north: Optional[float] = Query(default=None, ge=-90, le=90),
    south: Optional[float] = Query(default=None, ge=-90, le=90),
    east: Optional[float] = Query(default=None, ge=-180, le=180),
    west: Optional[float] = Query(default=None, ge=-180, le=180),
    limit: int = Query(default=MAX_PINS, ge=1, le=MAX_PINS),
    db: Session = Depends(get_db),
) -> MapPinsResponse:
    """Destination pins, optionally constrained to a viewport bounding box.

    The four bounds are all-or-nothing: a partial box is a client bug, and
    silently ignoring the half that was sent would return the whole world
    while looking like it had filtered.

    A box crossing the antimeridian (west > east) is handled by ORing the two
    longitude ranges instead of ANDing them, which would match nothing.
    """
    q = db.query(
        Destination.id,
        Destination.name,
        Destination.latitude,
        Destination.longitude,
        Destination.avg_rating,
        Destination.rating_count,
        Destination.terrain_difficulty,
    )

    bounds = [north, south, east, west]
    if any(b is not None for b in bounds):
        if any(b is None for b in bounds):
            raise HTTPException(
                status_code=422,
                detail="north, south, east and west must all be provided together",
            )
        if north < south:
            raise HTTPException(
                status_code=422, detail="north must be greater than south"
            )
        q = q.filter(
            Destination.latitude <= north, Destination.latitude >= south
        )
        if west <= east:
            q = q.filter(
                Destination.longitude >= west, Destination.longitude <= east
            )
        else:
            q = q.filter(
                (Destination.longitude >= west) | (Destination.longitude <= east)
            )

    # Fetch one past the limit to detect truncation without a second COUNT.
    rows = q.order_by(Destination.rating_count.desc(), Destination.id.asc()).limit(
        limit + 1
    ).all()
    truncated = len(rows) > limit
    rows = rows[:limit]

    return MapPinsResponse(
        pins=[
            DestinationPin(
                id=r.id,
                name=r.name,
                latitude=r.latitude,
                longitude=r.longitude,
                avg_rating=float(r.avg_rating or 0.0),
                rating_count=r.rating_count,
                terrain_difficulty=(
                    r.terrain_difficulty.value if r.terrain_difficulty else None
                ),
            )
            for r in rows
        ],
        total=len(rows),
        truncated=truncated,
    )
