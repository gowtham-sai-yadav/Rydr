"""Routes — the planned-waypoint side of a ride (start, stops, destination,
optional return-to-origin leg), separate from RideLog.recorded_track (the
*actual* GPS path once a ride happens). A route can be created private
(just for one ride plan) or published as a reusable "Rydr Route" others
can follow — save & publish.

Surface:
  POST /api/routes              — create (+ optionally publish)
  GET  /api/routes/{id}         — detail with ordered points
  GET  /api/routes?destination_id=  — published routes for a destination
  POST /api/routes/{id}/publish — publish a route you created, after the fact
"""
from __future__ import annotations

import math
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db
from app.models.destination import Destination
from app.models.route import Route, RoutePoint
from app.models.user import User
from app.schemas.route import (
    ElevationProfileOut,
    ElevationProfilePoint,
    RouteCreate,
    RouteListResponse,
    RouteOut,
)
from app.services.geo import haversine_km
from app.services.track_analysis import fetch_elevations

router = APIRouter()


def _compute_distance_km(points) -> Optional[float]:
    if len(points) < 2:
        return None
    ordered = sorted(points, key=lambda p: p.ordinal)
    total = 0.0
    for i in range(1, len(ordered)):
        a, b = ordered[i - 1], ordered[i]
        lat1, lng1 = math.radians(a.latitude), math.radians(a.longitude)
        lat2, lng2 = math.radians(b.latitude), math.radians(b.longitude)
        dlat, dlng = lat2 - lat1, lng2 - lng1
        h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
        total += 6371.0 * 2 * math.asin(math.sqrt(h))
    return round(total, 2)


def _load_route_or_404(db: Session, route_id: UUID) -> Route:
    route = (
        db.query(Route)
        .options(selectinload(Route.points))
        .filter(Route.id == route_id)
        .first()
    )
    if route is None:
        raise HTTPException(status_code=404, detail="Route not found")
    return route


@router.post("", response_model=RouteOut, status_code=201)
def create_route(
    payload: RouteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RouteOut:
    if not db.query(Destination.id).filter(Destination.id == payload.destination_id).first():
        raise HTTPException(status_code=404, detail="Destination not found")

    route = Route(
        destination_id=payload.destination_id,
        name=payload.name,
        description=payload.description,
        created_by_user_id=user.id,
        is_published=payload.publish,
        distance_km=_compute_distance_km(payload.points),
    )
    db.add(route)
    db.flush()

    for p in payload.points:
        db.add(
            RoutePoint(
                route_id=route.id,
                ordinal=p.ordinal,
                latitude=p.latitude,
                longitude=p.longitude,
                label=p.label,
                is_stop=p.is_stop,
            )
        )
    db.commit()
    return _load_route_or_404(db, route.id)


@router.get("/{route_id}", response_model=RouteOut)
def get_route(route_id: UUID, db: Session = Depends(get_db)) -> RouteOut:
    return _load_route_or_404(db, route_id)


@router.get("/{route_id}/elevation-profile", response_model=ElevationProfileOut)
def get_elevation_profile(route_id: UUID, db: Session = Depends(get_db)) -> ElevationProfileOut:
    """Elevation at each of the route's own waypoints (start/stops/
    destination/return) — sparse by nature since routes are waypoint
    plans, not dense GPS tracks; a ride log's recorded_track is what
    gets the finer-grained elevation_gain_m instead."""
    route = _load_route_or_404(db, route_id)
    ordered = sorted(route.points, key=lambda p: p.ordinal)
    if len(ordered) < 2:
        raise HTTPException(status_code=400, detail="Route needs at least 2 points for an elevation profile")

    elevations = fetch_elevations([(p.latitude, p.longitude) for p in ordered])
    if elevations is None:
        raise HTTPException(status_code=502, detail="Elevation data temporarily unavailable")

    points: list[ElevationProfilePoint] = []
    cumulative_km = 0.0
    gain = 0.0
    loss = 0.0
    for i, (p, elevation) in enumerate(zip(ordered, elevations)):
        if i > 0:
            cumulative_km += haversine_km(ordered[i - 1].latitude, ordered[i - 1].longitude, p.latitude, p.longitude)
            delta = elevation - elevations[i - 1]
            if delta > 0:
                gain += delta
            else:
                loss += -delta
        points.append(
            ElevationProfilePoint(
                ordinal=p.ordinal, label=p.label, distance_from_start_km=round(cumulative_km, 2), elevation_m=round(elevation, 0)
            )
        )

    return ElevationProfileOut(route_id=route_id, points=points, total_gain_m=round(gain, 0), total_loss_m=round(loss, 0))


@router.get("", response_model=RouteListResponse)
def list_routes(
    destination_id: UUID = Query(...),
    db: Session = Depends(get_db),
) -> RouteListResponse:
    routes = (
        db.query(Route)
        .filter(Route.destination_id == destination_id, Route.is_published.is_(True))
        .order_by(Route.created_at.desc())
        .all()
    )
    return RouteListResponse(routes=routes)


@router.post("/{route_id}/publish", response_model=RouteOut)
def publish_route(
    route_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RouteOut:
    route = _load_route_or_404(db, route_id)
    if route.created_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Only the route's creator can publish it")
    route.is_published = True
    db.commit()
    return _load_route_or_404(db, route.id)
