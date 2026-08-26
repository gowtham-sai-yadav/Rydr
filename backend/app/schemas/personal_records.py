"""Pydantic schemas for Personal Records."""
from __future__ import annotations

from datetime import date
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class LongestRideOut(BaseModel):
    ride_log_id: UUID
    distance_km: float
    destination_name: Optional[str] = None
    ride_date: Optional[date] = None


class BestMonthOut(BaseModel):
    year: int
    month: int
    total_distance_km: float
    ride_count: int


class BestWeekOut(BaseModel):
    week_start: date
    destination_count: int


class PersonalRecordsOut(BaseModel):
    longest_ride: Optional[LongestRideOut] = None
    best_month: Optional[BestMonthOut] = None
    most_destinations_in_a_week: Optional[BestWeekOut] = None


class BestEffortOut(BaseModel):
    """A rider's fastest completion of a specific published Route, only
    possible because route_matching.py already tags matching RideLogs
    with matched_route_id — this just picks the best one per route."""

    route_id: UUID
    route_name: Optional[str] = None
    destination_name: Optional[str] = None
    best_moving_duration_seconds: int
    best_avg_speed_kmh: Optional[float] = None
    attempt_count: int
    achieved_at: Optional[date] = None


class BestEffortListResponse(BaseModel):
    efforts: list[BestEffortOut] = []
