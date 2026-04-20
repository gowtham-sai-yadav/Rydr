"""Pydantic schemas for RideLog + RideMedia."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.models.ride_log import MediaType, RoadCondition


class RideMediaOut(BaseModel):
    id: UUID
    ride_log_id: UUID
    url: str
    media_type: MediaType
    uploaded_by_user_id: Optional[UUID] = None
    caption: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RideMediaCreate(BaseModel):
    url: str
    media_type: MediaType = MediaType.image
    caption: Optional[str] = None


class RideLogOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    rider_id: UUID
    actual_start_ts: Optional[datetime] = None
    actual_end_ts: Optional[datetime] = None
    actual_cost: Optional[int] = None
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    media: List[RideMediaOut] = []

    class Config:
        from_attributes = True


class RideLogCreate(BaseModel):
    ride_plan_id: UUID


class RideLogUpdate(BaseModel):
    actual_start_ts: Optional[datetime] = None
    actual_end_ts: Optional[datetime] = None
    actual_cost: Optional[int] = None
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None
    notes: Optional[str] = None
