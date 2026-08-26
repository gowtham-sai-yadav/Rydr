"""Pydantic schemas for Trip — groups a sequence of RideLogs into one
multi-day tour with combined stats."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class TripCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)


class TripRideLogAdd(BaseModel):
    ride_log_id: UUID
    day_index: int = Field(ge=1)


class TripDayOut(BaseModel):
    day_index: int
    ride_log_id: UUID
    ride_plan_id: UUID
    destination_name: Optional[str] = None
    distance_km: Optional[float] = None
    actual_start_ts: Optional[datetime] = None
    thumbnail_url: Optional[str] = None


class TripOut(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    description: Optional[str] = None
    created_at: datetime
    days: List[TripDayOut] = []
    total_distance_km: float = 0
    total_days: int = 0


class TripListResponse(BaseModel):
    trips: List[TripOut] = []
