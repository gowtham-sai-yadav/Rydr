"""OpenStreetMap provider — the shipped default (Phase 4 W2).

Tiles from openstreetmap.org, routing from OSRM, geocoding from Nominatim.
No account, no API key, no usage ceiling to monitor.

Rate limits and courtesy
------------------------
The public OSRM and Nominatim endpoints are donated infrastructure with usage
policies that ask for a identifying User-Agent, low request rates, and caching
of results. All three are honoured: the agent is set in ``maps/http``, routes
are memoised in-process, and coordinates are rounded before they become a
cache key so two riders leaving from the same neighbourhood share one upstream
call rather than making two.

For staging, point ``OSRM_BASE_URL`` and ``NOMINATIM_BASE_URL`` at
self-hosted instances; nothing else changes.

No static image API
-------------------
OSM has no equivalent of Mapbox's Static Images API, so
:meth:`static_image_url` returns None. That is why the Phase 4 share cards
draw their own schematic route rather than embedding a map bitmap — the
capability genuinely is not there, and the card is honest about it instead of
leaving a broken image.
"""
from __future__ import annotations

import functools
import logging
from typing import List, Optional

from app.config import settings
from app.services.geo import haversine_km
from app.services.maps.base import (
    Coordinate,
    GeocodeResult,
    MapProvider,
    RouteResult,
    TileConfig,
)
from app.services.maps.http import get_json

logger = logging.getLogger(__name__)

# Coordinate precision used for cache keys. 3 decimal places is about 110m —
# fine enough that the route is still right, coarse enough that riders leaving
# from the same area share a cache entry.
_CACHE_PRECISION = 3

# Straight-line distance inflated to approximate road distance, for the
# fallback path. Indian highway routing between towns typically runs 20-30%
# longer than the great-circle; 1.25 is the middle of that and is only ever
# used on a result already flagged is_estimate=True.
ROAD_WINDING_FACTOR = 1.25

# Fallback average speed, km/h, for estimating duration without a router.
FALLBACK_AVG_SPEED_KMH = 40.0


class OsmProvider(MapProvider):
    name = "osm"

    def tile_config(self) -> TileConfig:
        return TileConfig(
            provider=self.name,
            tile_url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            # Required by the OSM tile usage policy. Returned from the API so
            # a client cannot ship without it.
            attribution=(
                '&copy; <a href="https://www.openstreetmap.org/copyright">'
                "OpenStreetMap</a> contributors"
            ),
            max_zoom=19,
            access_token=None,
        )

    def route(self, origin: Coordinate, destination: Coordinate) -> RouteResult:
        return _cached_route(
            round(origin[0], _CACHE_PRECISION),
            round(origin[1], _CACHE_PRECISION),
            round(destination[0], _CACHE_PRECISION),
            round(destination[1], _CACHE_PRECISION),
        )

    def geocode(self, query: str, limit: int = 5) -> List[GeocodeResult]:
        params = {"q": query, "format": "jsonv2", "limit": limit}
        countries = settings.GEOCODE_COUNTRIES.strip()
        if countries:
            # Nominatim spells it "countrycodes"; Mapbox spells it "country".
            params["countrycodes"] = countries
        payload = get_json(f"{settings.NOMINATIM_BASE_URL}/search", params)
        if not isinstance(payload, list):
            return []

        results: List[GeocodeResult] = []
        for item in payload:
            try:
                results.append(
                    GeocodeResult(
                        name=item.get("display_name") or query,
                        latitude=float(item["lat"]),
                        longitude=float(item["lon"]),
                        kind=item.get("type"),
                    )
                )
            except (KeyError, TypeError, ValueError):
                # One malformed entry must not lose the rest of the results.
                continue
        return results

    def static_image_url(
        self,
        center: Coordinate,
        *,
        zoom: int = 11,
        width: int = 600,
        height: int = 400,
        marker: bool = True,
    ) -> Optional[str]:
        # See module docstring — OSM has no static image service.
        return None


@functools.lru_cache(maxsize=512)
def _cached_route(
    o_lat: float, o_lon: float, d_lat: float, d_lon: float
) -> RouteResult:
    """Fetch and memoise one route.

    Cached on the module rather than the instance so the cache survives
    provider re-instantiation, and keyed on rounded coordinates by the caller.
    RouteResult is frozen, so handing the same object to several callers is
    safe.
    """
    url = (
        f"{settings.OSRM_BASE_URL}/route/v1/driving/"
        f"{o_lon},{o_lat};{d_lon},{d_lat}"
    )
    payload = get_json(url, {"overview": "simplified", "geometries": "geojson"})

    routes = (payload or {}).get("routes") if isinstance(payload, dict) else None
    if routes:
        route = routes[0]
        try:
            # OSRM returns [lon, lat]; the rest of this codebase and every
            # mapping client used here expects (lat, lon). Flipping here means
            # the swap happens once, at the boundary.
            coords = [
                (float(lat), float(lon))
                for lon, lat in route["geometry"]["coordinates"]
            ]
            return RouteResult(
                distance_km=round(float(route["distance"]) / 1000.0, 1),
                duration_minutes=int(round(float(route["duration"]) / 60.0)),
                geometry=coords,
                is_estimate=False,
                provider="osrm",
            )
        except (KeyError, TypeError, ValueError) as exc:
            logger.warning("OSRM returned an unparseable route: %s", exc)

    # Fallback: great-circle inflated for road winding. Flagged as an estimate
    # and carrying no geometry, because drawing a straight line between two
    # towns would show a road that does not exist.
    straight = haversine_km(o_lat, o_lon, d_lat, d_lon)
    approx_km = round(straight * ROAD_WINDING_FACTOR, 1)
    return RouteResult(
        distance_km=approx_km,
        duration_minutes=int(round(approx_km / FALLBACK_AVG_SPEED_KMH * 60)),
        geometry=[],
        is_estimate=True,
        provider="estimate",
    )
