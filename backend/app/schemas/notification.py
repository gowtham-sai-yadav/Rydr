"""Notification API schemas — Phase 4 W5."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.schemas.user import UserBrief


class NotificationOut(BaseModel):
    id: UUID
    type: str
    title: str
    body: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[UUID] = None
    read_at: Optional[datetime] = None
    created_at: datetime
    actor: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    notifications: List[NotificationOut] = []
    total: int
    unread: int
    page: int
    limit: int


class UnreadCountResponse(BaseModel):
    unread: int


class MarkReadResponse(BaseModel):
    marked: int
