"""Pydantic schemas for Notification."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.models.notification import NotificationType


class NotificationOut(BaseModel):
    id: UUID
    type: NotificationType
    actor_id: Optional[UUID] = None
    ride_plan_id: Optional[UUID] = None
    post_id: Optional[UUID] = None
    badge_id: Optional[UUID] = None
    message: str
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationListResponse(BaseModel):
    notifications: List[NotificationOut] = []
    total: int
    page: int
    limit: int
    unread_count: int
