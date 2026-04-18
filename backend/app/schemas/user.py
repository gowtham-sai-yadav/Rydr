from __future__ import annotations

from typing import Optional
from pydantic import BaseModel
from uuid import UUID


class BikeOut(BaseModel):
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: UUID
    name: str
    email: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    bike: Optional[BikeOut] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None


class BikeUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None


class UserStatsOut(BaseModel):
    rides_captained: int
    rides_joined: int
    rides_completed: int
