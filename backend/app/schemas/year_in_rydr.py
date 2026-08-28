"""Pydantic schema for the "Year in Rydr" annual recap."""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


class TopDestinationOut(BaseModel):
    destination_id: UUID
    name: str
    ride_count: int


class YearInRydrOut(BaseModel):
    year: int
    total_rides: int
    total_distance_km: float
    total_elevation_gain_m: float
    total_moving_hours: float
    longest_ride_km: Optional[float] = None
    top_destination: Optional[TopDestinationOut] = None
    distinct_destinations: int
    badges_earned: int
    active_months: int
