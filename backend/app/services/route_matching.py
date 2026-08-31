"""Route matching - does a logged ride's track line up with a published
Route? Heuristic, not exact-path comparison: same destination, and the
track's start/end points both land within MATCH_RADIUS_KM of the route's
first/last waypoints. Good enough to link "I rode this" back to "someone
published this exact route" without needing full polyline-similarity math.
"""
from __future__ import annotations

import math
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session, selectinload

from app.models.route import Route, RoutePoint

MATCH_RADIUS_KM = 3.0


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 6371.0 * 2 * math.asin(math.sqrt(h))


def find_matching_route(
    db: Session, destination_id: UUID, track_start: tuple[float, float], track_end: tuple[float, float]
) -> Optional[UUID]:
    routes = (
        db.query(Route)
        .options(selectinload(Route.points))
        .filter(Route.destination_id == destination_id, Route.is_published.is_(True))
        .all()
    )
    for route in routes:
        points = sorted(route.points, key=lambda p: p.ordinal)
        if len(points) < 2:
            continue
        route_start = (points[0].latitude, points[0].longitude)
        route_end = (points[-1].latitude, points[-1].longitude)
        if (
            _haversine_km(track_start, route_start) <= MATCH_RADIUS_KM
            and _haversine_km(track_end, route_end) <= MATCH_RADIUS_KM
        ):
            return route.id
    return None
