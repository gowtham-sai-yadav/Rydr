"""Moderation report schemas — Phase 4 W7."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.report import ReportedContentType, ReportReason, ReportStatus
from app.schemas.user import UserBrief


class ReportCreate(BaseModel):
    content_type: ReportedContentType
    content_id: UUID
    reason: ReportReason
    details: Optional[str] = Field(default=None, max_length=2000)


class ReportOut(BaseModel):
    id: UUID
    content_type: str
    content_id: UUID
    reason: str
    details: Optional[str] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None

    class Config:
        from_attributes = True


class AdminReportOut(ReportOut):
    """Admin view — adds who reported it, who resolved it, and how many
    other people reported the same content.

    ``report_count`` is what separates one annoyed rider from a real problem,
    so it is on the queue row rather than requiring a drill-down.
    """

    reporter: Optional[UserBrief] = None
    resolver: Optional[UserBrief] = None
    report_count: int = 1


class ReportListResponse(BaseModel):
    reports: List[ReportOut] = []
    total: int
    page: int
    limit: int


class AdminReportListResponse(BaseModel):
    reports: List[AdminReportOut] = []
    total: int
    open_count: int
    page: int
    limit: int


class ReportResolve(BaseModel):
    status: ReportStatus
    resolution_note: Optional[str] = Field(default=None, max_length=2000)
