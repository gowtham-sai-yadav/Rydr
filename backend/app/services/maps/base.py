"""Map provider interface — Phase 4 W2.

Everything the app needs from a mapping vendor, expressed as four operations
so the vendor can be swapped in configuration rather than in code.

The Phase 4 plan named Mapbox primary with OpenStreetMap "kept in reserve if
Mapbox's free tier becomes a cost constraint". The reconciliation inverted the
default (OSM ships, Mapbox is available behind a token) and this interface is
what makes that inversion cheap in either direction. It also removes the
plan's §7 risk entry about Mapbox quota from the critical path: nothing breaks
if the token is never issued.

Failure policy
--------------
Routing and geocoding call third-party HTTP services that can be slow, rate
limited, or down. None of them is allowed to fail a Rydr request. Every
provider method returns a result object carrying an ``is_estimate`` flag; when
the upstream cannot be reached the provider falls back to a straight-line
computation and sets the flag, and the API surfaces it so the client can label
the number rather than present a guess as a measurement.
"""
from __future__ import annotations

import abc
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

Coordinate = Tuple[float, float]  # (latitude, longitude)


@dataclass(frozen=True)
class RouteResult:
    """A road route between two points."""

    distance_km: float
    duration_minutes: Optional[int]
    # [(lat, lon), ...] along the road. Empty when this is a straight-line
    # estimate — a two-point line would imply a road that may not exist.
    geometry: List[Coordinate] = field(default_factory=list)
    # True when the upstream router was unavailable and this is the
    # great-circle fallback rather than a real road route.
    is_estimate: bool = True
    provider: str = "none"


@dataclass(frozen=True)
class GeocodeResult:
    name: str
    latitude: float
    longitude: float
    kind: Optional[str] = None


@dataclass(frozen=True)
class TileConfig:
    """What a client needs to render a slippy map itself."""

    provider: str
    tile_url: str
    # Attribution is a licence obligation for OSM, not a nicety. It is
    # returned by the API so a client cannot forget it.
    attribution: str
    max_zoom: int = 19
    # Only set for providers that need a client-side key.
    access_token: Optional[str] = None


class MapProvider(abc.ABC):
    """The operations Rydr needs from a mapping vendor."""

    name: str = "base"

    @abc.abstractmethod
    def tile_config(self) -> TileConfig:
        """Client-side map rendering configuration."""

    @abc.abstractmethod
    def route(self, origin: Coordinate, destination: Coordinate) -> RouteResult:
        """Road route between two points, or a flagged straight-line estimate."""

    @abc.abstractmethod
    def geocode(self, query: str, limit: int = 5) -> List[GeocodeResult]:
        """Free-text place search. Empty list on failure, never an exception."""

    @abc.abstractmethod
    def static_image_url(
        self,
        center: Coordinate,
        *,
        zoom: int = 11,
        width: int = 600,
        height: int = 400,
        marker: bool = True,
    ) -> Optional[str]:
        """URL of a static map image, or None if the provider has none."""
