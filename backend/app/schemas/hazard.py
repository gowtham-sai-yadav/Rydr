"""Pydantic schemas for HazardReport."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.hazard import HazardType
from app.schemas.user import UserBrief


class HazardReportCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    hazard_type: HazardType
    description: Optional[str] = Field(default=None, max_length=500)
    destination_id: Optional[UUID] = None


class HazardReportOut(BaseModel):
    id: UUID
    latitude: float
    longitude: float
    hazard_type: HazardType
    description: Optional[str] = None
    destination_id: Optional[UUID] = None
    reporter: Optional[UserBrief] = None
    created_at: datetime
    expires_at: datetime
    is_active: bool

    class Config:
        from_attributes = True


class HazardReportListResponse(BaseModel):
    hazards: List[HazardReportOut] = []
