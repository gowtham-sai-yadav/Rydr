"""Pydantic schemas for Badge + UserBadge."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class BadgeOut(BaseModel):
    id: UUID
    slug: str
    name: str
    description: str
    icon_url: Optional[str] = None

    class Config:
        from_attributes = True


class UserBadgeOut(BaseModel):
    id: UUID
    user_id: UUID
    badge_id: UUID
    earned_at: datetime
    badge: Optional[BadgeOut] = None

    class Config:
        from_attributes = True
