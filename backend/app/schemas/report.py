"""Pydantic schemas for Report (moderation)."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.report import ReportStatus, ReportTargetType


class ReportCreate(BaseModel):
    target_type: ReportTargetType
    target_id: UUID
    reason: str = Field(min_length=1, max_length=1000)


class ReportStatusUpdate(BaseModel):
    status: ReportStatus


class ReportOut(BaseModel):
    id: UUID
    reporter_id: UUID
    target_type: ReportTargetType
    target_id: UUID
    reason: str
    status: ReportStatus
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ReportListResponse(BaseModel):
    reports: List[ReportOut] = []
    total: int
    page: int
    limit: int
