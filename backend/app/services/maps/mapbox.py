"""Mapbox provider — Phase 4 W2, inactive unless MAPBOX_TOKEN is set.

The Phase 4 plan specifies Mapbox for tiles, Directions and Static Images. The
reconciliation ships OpenStreetMap by default so the project needs no account
and has no usage ceiling to watch, and keeps this adapter so switching is a
matter of setting one environment variable.

It is written against the documented Mapbox API shapes. Because no token was
issued for this project, it has been exercised against recorded response
shapes rather than the live service — that distinction is recorded here rather
than left for someone to discover. The OSM path is the one with live coverage.
"""
from __future__ import annotations

import logging
import urllib.parse
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
from app.services.maps.osm import FALLBACK_AVG_SPEED_KMH, ROAD_WINDING_FACTOR

logger = logging.getLogger(__name__)

_API = "https://api.mapbox.com"


class MapboxProvider(MapProvider):
    name = "mapbox"

    def tile_config(self) -> TileConfig:
        return TileConfig(
            provider=self.name,
            tile_url=(
                "https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/"
                "{z}/{x}/{y}?access_token=" + settings.MAPBOX_TOKEN
            ),
            attribution=(
                '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> '
                '&copy; <a href="https://www.openstreetmap.org/copyright">'
                "OpenStreetMap</a> contributors"
            ),
            max_zoom=22,
            access_token=settings.MAPBOX_TOKEN,
        )

    def route(self, origin: Coordinate, destination: Coordinate) -> RouteResult:
        url = (
            f"{_API}/directions/v5/mapbox/driving/"
            f"{origin[1]},{origin[0]};{destination[1]},{destination[0]}"
        )
        payload = get_json(
            url,
            {
                "geometries": "geojson",
                "overview": "simplified",
                "access_token": settings.MAPBOX_TOKEN,
            },
        )
        routes = (payload or {}).get("routes") if isinstance(payload, dict) else None
        if routes:
            try:
                route = routes[0]
                coords = [
                    (float(lat), float(lon))
                    for lon, lat in route["geometry"]["coordinates"]
                ]
                return RouteResult(
                    distance_km=round(float(route["distance"]) / 1000.0, 1),
                    duration_minutes=int(round(float(route["duration"]) / 60.0)),
                    geometry=coords,
                    is_estimate=False,
                    provider="mapbox",
                )
            except (KeyError, TypeError, ValueError) as exc:
                logger.warning("Mapbox returned an unparseable route: %s", exc)

        straight = haversine_km(origin[0], origin[1], destination[0], destination[1])
        approx = round(straight * ROAD_WINDING_FACTOR, 1)
        return RouteResult(
            distance_km=approx,
            duration_minutes=int(round(approx / FALLBACK_AVG_SPEED_KMH * 60)),
            geometry=[],
            is_estimate=True,
            provider="estimate",
        )

    def geocode(self, query: str, limit: int = 5) -> List[GeocodeResult]:
        encoded = urllib.parse.quote(query)
        payload = get_json(
            f"{_API}/geocoding/v5/mapbox.places/{encoded}.json",
            {"limit": limit, "access_token": settings.MAPBOX_TOKEN},
        )
        features = (payload or {}).get("features") if isinstance(payload, dict) else None
        if not features:
            return []

        results: List[GeocodeResult] = []
        for f in features:
            try:
                lon, lat = f["center"]
                results.append(
                    GeocodeResult(
                        name=f.get("place_name") or query,
                        latitude=float(lat),
                        longitude=float(lon),
                        kind=(f.get("place_type") or [None])[0],
                    )
                )
            except (KeyError, TypeError, ValueError):
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
        lat, lon = center
        overlay = f"pin-l+f97316({lon},{lat})/" if marker else ""
        return (
            f"{_API}/styles/v1/mapbox/outdoors-v12/static/"
            f"{overlay}{lon},{lat},{zoom},0/{width}x{height}@2x"
            f"?access_token={settings.MAPBOX_TOKEN}"
        )
