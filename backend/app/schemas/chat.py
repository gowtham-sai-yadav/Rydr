from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from uuid import UUID


class ChatGroupOut(BaseModel):
    id: UUID
    ride_id: UUID
    name: str

    class Config:
        from_attributes = True


class ChatMessageOut(BaseModel):
    id: str
    sender_name: str
    sender_avatar: Optional[str] = None
    content: str
    timestamp: str
    is_mine: bool
