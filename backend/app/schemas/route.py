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
    created_at: datetime
    points: List[RoutePointOut] = []

    class Config:
        from_attributes = True


class RouteCreate(BaseModel):
    destination_id: UUID
    name: Optional[str] = None
    description: Optional[str] = None
    points: List[RoutePointCreate] = []
