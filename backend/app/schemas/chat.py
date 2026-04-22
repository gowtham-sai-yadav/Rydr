"""Pydantic schemas for ChatGroup + ChatMessage (M5 canonical shapes).

Replaces the M1 mock shape (`sender_name` / `content` / `timestamp` / `is_mine`)
with canonical fields that mirror the DB columns and reuse `UserBrief` from
`schemas/user` — same pattern as M2 ratings, M3 participants, M4 ride logs.

The `is_mine` flag is intentionally not on `ChatMessageOut`: the client derives
it as `msg.author.id === currentUser.id`. Server-baking caller-relative state
breaks cacheability.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.ride import RidePlanStatus
from app.schemas.user import UserBrief


MAX_BODY_LEN = 2000


class ChatGroupRide(BaseModel):
    """Slim ride summary embedded on `ChatGroupOut` — just enough to render
    the chat-room header (title, date, status, destination, member count)
    without needing a second `/api/rides/{id}` round-trip.

    Defined locally (not re-using `RidePlanSummary` from `schemas/ride`) to
    keep chat ↔ ride coupling minimal and the payload focused.
    """

    id: UUID  # ride_plan_id
    title: str
    planned_date: date
    status: RidePlanStatus
    captain_id: UUID
    destination_id: UUID
    destination_name: Optional[str] = None
    # Approved-participant count (captain is always approved per M3 auto-join).
    participant_count: int = 0


class ChatGroupOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    name: str
    ride: Optional[ChatGroupRide] = None

    class Config:
        from_attributes = True


class ChatGroupListResponse(BaseModel):
    groups: List[ChatGroupOut] = []
    total: int
    page: int
    limit: int


class ChatMessageOut(BaseModel):
    id: UUID
    chat_group_id: UUID
    body: str
    created_at: datetime
    author: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class ChatMessageListResponse(BaseModel):
    """`has_more` is true when `len(messages) == limit` — caller may want to
    poll again (when used with `since`) or page back further (initial load)."""

    messages: List[ChatMessageOut] = []
    has_more: bool = False


class ChatMessageCreate(BaseModel):
    body: str = Field(min_length=1, max_length=MAX_BODY_LEN)

    @field_validator("body")
    @classmethod
    def _strip_and_reject_blank(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("body cannot be empty or whitespace-only")
        return stripped
