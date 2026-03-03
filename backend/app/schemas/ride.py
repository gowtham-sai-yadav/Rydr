from __future__ import annotations

from typing import Optional, List
from pydantic import BaseModel
from uuid import UUID


class RideStopCreate(BaseModel):
    name: str
    description: Optional[str] = None
    stop_order: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_break_stop: bool = False


class RideStopOut(BaseModel):
    id: UUID
    ride_id: UUID
    name: str
    description: Optional[str] = None
    stop_order: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_break_stop: bool

    class Config:
        from_attributes = True


class RideCreate(BaseModel):
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    ride_date: str
    start_time: str
    estimated_end_time: Optional[str] = None
    difficulty_level: str = "moderate"
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    max_riders: int = 10
    stops: List[RideStopCreate] = []


class RideUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    ride_date: Optional[str] = None
    start_time: Optional[str] = None
    estimated_end_time: Optional[str] = None
    difficulty_level: Optional[str] = None
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    status: Optional[str] = None
    max_riders: Optional[int] = None


class UserBrief(BaseModel):
    id: UUID
    name: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class ParticipantOut(BaseModel):
    id: UUID
    ride_id: UUID
    user_id: UUID
    status: str
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class RideOut(BaseModel):
    id: UUID
    captain_id: UUID
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    ride_date: str
    start_time: str
    estimated_end_time: Optional[str] = None
    difficulty_level: str
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    status: str
    max_riders: int
    captain: Optional[UserBrief] = None
    stops: List[RideStopOut] = []
    participants: List[ParticipantOut] = []
    participant_count: int = 0

    class Config:
        from_attributes = True


class ParticipantStatusUpdate(BaseModel):
    status: str
