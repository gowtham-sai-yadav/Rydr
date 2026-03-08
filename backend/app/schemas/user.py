"""Pydantic schemas for User + Bike + UserStats — extended in M1 with home_location + bike mileage/type."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel

from app.models.ride import BikeType


class BikeOut(BaseModel):
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_cc: Optional[int] = None
    mileage_kmpl: Optional[float] = None
    type: BikeType

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: UUID
    name: str
    email: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    home_city: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    bike: Optional[BikeOut] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    home_city: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None


class BikeUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_cc: Optional[int] = None
    mileage_kmpl: Optional[float] = None
    type: Optional[BikeType] = None


class UserStatsOut(BaseModel):
    rides_captained: int
    rides_joined: int
    rides_completed: int
