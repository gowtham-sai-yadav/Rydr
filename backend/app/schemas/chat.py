"""Pydantic schemas for ChatGroup (and the mock ChatMessageOut kept until M5)."""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class ChatGroupOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    name: str

    class Config:
        from_attributes = True


class ChatMessageOut(BaseModel):
    """Current mock shape served by /api/chat/groups/{id}/messages.

    M5 replaces this with a real UUID-based ChatMessage schema backed by
    the chat_messages table.
    """

    id: str
    sender_name: str
    sender_avatar: Optional[str] = None
    content: str
    timestamp: str
    is_mine: bool
