"""Map / routing API schemas — Phase 4 W2."""
from __future__ import annotations

from typing import List, Optional, Tuple
from uuid import UUID

from pydantic import BaseModel


class MapConfigOut(BaseModel):
    provider: str
    tile_url: str
    # A licence obligation for OSM, returned so a client cannot omit it.
    attribution: str
    max_zoom: int
    access_token: Optional[str] = None


class RouteOut(BaseModel):
    origin: Tuple[float, float]
    destination: Tuple[float, float]
    distance_km: float
    duration_minutes: Optional[int] = None
    # [(lat, lon), ...]. Empty when is_estimate is true.
    geometry: List[Tuple[float, float]] = []
    # True when the router was unreachable and this is a straight-line
    # approximation. Clients must label it rather than present it as a road
    # distance.
    is_estimate: bool
    provider: str


class GeocodeHit(BaseModel):
    name: str
    latitude: float
    longitude: float
    kind: Optional[str] = None


class GeocodeResponse(BaseModel):
    query: str
    results: List[GeocodeHit] = []


class DestinationPin(BaseModel):
    """One destination reduced to what a map pin needs.

    Separate from DestinationSummary on purpose: a map view loads hundreds of
    pins at once, and shipping the full summary for each would multiply the
    payload for fields no pin renders.
    """

    id: UUID
    name: str
    latitude: float
    longitude: float
    avg_rating: float
    rating_count: int
    terrain_difficulty: Optional[str] = None


class MapPinsResponse(BaseModel):
    pins: List[DestinationPin] = []
    total: int
    # True when the result hit the cap and the client should zoom in rather
    # than assume it is seeing everything.
    truncated: bool = False
