"""Map provider selection — Phase 4 W2.

``get_provider()`` is the only entry point the rest of the app uses. It reads
the configuration rather than taking an argument, so no caller has to know
which vendor is active or carry a branch for it.
"""
from __future__ import annotations

from app.config import settings
from app.services.maps.base import (
    Coordinate,
    GeocodeResult,
    MapProvider,
    RouteResult,
    TileConfig,
)
from app.services.maps.mapbox import MapboxProvider
from app.services.maps.osm import OsmProvider

__all__ = [
    "Coordinate",
    "GeocodeResult",
    "MapProvider",
    "RouteResult",
    "TileConfig",
    "get_provider",
]

_OSM = OsmProvider()
_MAPBOX = MapboxProvider()


def get_provider() -> MapProvider:
    """The active provider, chosen by ``settings.maps_provider``.

    Instances are stateless (the route cache lives on the module, not the
    object), so both are constructed once at import and reused.
    """
    return _MAPBOX if settings.maps_provider == "mapbox" else _OSM
