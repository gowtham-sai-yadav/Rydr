"""Pydantic schemas for Route + RoutePoint."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class RoutePointOut(BaseModel):
    id: UUID
    ordinal: int
    latitude: float
    longitude: float
    label: Optional[str] = None
    is_stop: bool

    class Config:
        from_attributes = True


class RoutePointCreate(BaseModel):
    ordinal: int
    latitude: float
    longitude: float
    label: Optional[str] = None
    is_stop: bool = False


class RouteOut(BaseModel):
    id: UUID
    destination_id: UUID
    name: Optional[str] = None
    description: Optional[str] = None
    created_by_user_id: Optional[UUID] = None
    is_published: bool = False
    distance_km: Optional[float] = None
    created_at: datetime
    points: List[RoutePointOut] = []

    class Config:
        from_attributes = True


class ElevationProfilePoint(BaseModel):
    ordinal: int
    label: Optional[str] = None
    distance_from_start_km: float
    elevation_m: float


class ElevationProfileOut(BaseModel):
    route_id: UUID
    points: List[ElevationProfilePoint] = []
    total_gain_m: float
    total_loss_m: float


class RouteSummary(BaseModel):
    """Slim shape for "browse published routes" lists — no points array."""

    id: UUID
    destination_id: UUID
    name: Optional[str] = None
    distance_km: Optional[float] = None
    created_by_user_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RouteListResponse(BaseModel):
    routes: List[RouteSummary] = []


class RouteCreate(BaseModel):
    destination_id: UUID
    name: Optional[str] = None
    description: Optional[str] = None
    points: List[RoutePointCreate] = []
    # True = immediately publish as a reusable "Rydr Route" others can
    # follow (save & publish). False = keep private to just this ride's plan.
    publish: bool = False
