"""Pydantic schemas for User + Bike + UserStats — extended in M1 with home_location + bike mileage/type.

``UserBrief`` lives here (and not in ``schemas/ride``) because it's a generic
user-summary DTO consumed by destinations, ratings, ride plans, chat — the
user domain owns it. The original definition in ``schemas/ride`` is now a
re-export for back-compat.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.ride import BikeType


class UserBrief(BaseModel):
    id: UUID
    name: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class BikeOut(BaseModel):
    id: UUID
    user_id: UUID
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_cc: Optional[int] = None
    mileage_kmpl: Optional[float] = None
    type: BikeType

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: UUID
    name: str
    email: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    home_city: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None
    created_at: datetime
    updated_at: datetime
    bike: Optional[BikeOut] = None
    # M6 follow surface — populated by ``routers/users.py::_load_user_with_social``
    # via scalar subqueries folded into the main SELECT (one round trip vs four).
    # ``is_followed_by_me`` is False for anonymous callers, False for the
    # caller's own profile (DB-level ``ck_follow_not_self`` makes the EXISTS
    # query return zero rows naturally).
    followers_count: int = 0
    following_count: int = 0
    is_followed_by_me: bool = False

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    avatar_url: Optional[str] = Field(default=None, max_length=500)
    bio: Optional[str] = Field(default=None, max_length=2000)
    home_city: Optional[str] = Field(default=None, max_length=100)
    # Bounds enforced server-side because home coords feed the M2 Haversine
    # filter + cost calculator — an out-of-range value silently poisons every
    # subsequent radius/distance/cost call for the user.
    home_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    home_longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class BikeUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_cc: Optional[int] = None
    mileage_kmpl: Optional[float] = None
    type: Optional[BikeType] = None


class UserStatsOut(BaseModel):
    rides_captained: int
    rides_joined: int
    rides_completed: int
