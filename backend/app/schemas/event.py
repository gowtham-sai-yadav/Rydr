"""Pydantic schemas for Event + EventRSVP."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.event import RSVPStatus
from app.schemas.user import UserBrief


class EventCreate(BaseModel):
    club_id: Optional[UUID] = None
    destination_id: Optional[UUID] = None
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    event_date: datetime
    meeting_point: Optional[str] = Field(default=None, max_length=255)
    meeting_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    meeting_longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class EventOut(BaseModel):
    id: UUID
    club_id: Optional[UUID] = None
    destination_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    event_date: datetime
    meeting_point: Optional[str] = None
    meeting_latitude: Optional[float] = None
    meeting_longitude: Optional[float] = None
    created_by_user_id: UUID
    created_at: datetime
    going_count: int = 0
    interested_count: int = 0
    my_rsvp: Optional[RSVPStatus] = None

    class Config:
        from_attributes = True


class EventListResponse(BaseModel):
    events: List[EventOut] = []
    total: int
    page: int
    limit: int


class EventRSVPCreate(BaseModel):
    status: RSVPStatus = RSVPStatus.going


class EventRSVPOut(BaseModel):
    user: UserBrief
    status: RSVPStatus
    created_at: datetime


class EventRSVPListResponse(BaseModel):
    rsvps: List[EventRSVPOut] = []
