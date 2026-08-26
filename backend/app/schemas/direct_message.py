"""Pydantic schemas for DMThread + DirectMessage."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.user import UserBrief

MAX_BODY_LEN = 2000


class DirectMessageOut(BaseModel):
    id: UUID
    thread_id: UUID
    body: str
    created_at: datetime
    read_at: Optional[datetime] = None
    author: UserBrief

    class Config:
        from_attributes = True


class DirectMessageListResponse(BaseModel):
    messages: List[DirectMessageOut] = []
    total: int
    page: int
    limit: int


class DirectMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY_LEN)


class DMThreadOut(BaseModel):
    id: UUID
    other_user: UserBrief
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0


class DMThreadListResponse(BaseModel):
    threads: List[DMThreadOut] = []
