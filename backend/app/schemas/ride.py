"""Pydantic schemas for RidePlan + RidePlanParticipant.

Renamed from Ride* in M1 — uses proper date/time types and references a Destination.
Used by M3 when the rides router is rewritten. Live here so the types exist for seed + tests.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.ride import (
    DifficultyLevel,
    ParticipantStatus,
    RidePlanStatus,
    RidePlanVisibility,
)

# UserBrief lives in schemas/user — re-exported here for back-compat.
from app.schemas.user import UserBrief  # noqa: F401


class RidePlanParticipantOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    user_id: UUID
    status: ParticipantStatus
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class RidePlanCreate(BaseModel):
    destination_id: UUID
    route_id: Optional[UUID] = None
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    planned_date: date
    planned_start_time: time
    estimated_end_time: Optional[time] = None
    visibility: RidePlanVisibility = RidePlanVisibility.group
    difficulty_level: DifficultyLevel = DifficultyLevel.moderate
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    max_riders: int = 10


class RidePlanUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    planned_date: Optional[date] = None
    planned_start_time: Optional[time] = None
    estimated_end_time: Optional[time] = None
    difficulty_level: Optional[DifficultyLevel] = None
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    status: Optional[RidePlanStatus] = None
    max_riders: Optional[int] = None


class RidePlanOut(BaseModel):
    id: UUID
    destination_id: UUID
    route_id: Optional[UUID] = None
    captain_id: UUID
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    planned_date: date
    planned_start_time: time
    estimated_end_time: Optional[time] = None
    visibility: RidePlanVisibility
    difficulty_level: DifficultyLevel
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    max_riders: int
    status: RidePlanStatus
    created_at: datetime
    updated_at: datetime
    captain: Optional[UserBrief] = None
    participants: List[RidePlanParticipantOut] = []
    participant_count: int = 0

    class Config:
        from_attributes = True


class ParticipantStatusUpdate(BaseModel):
    status: ParticipantStatus
