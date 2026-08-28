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
    total_km_since_service: float = 0
    total_km_lifetime: float = 0
    service_interval_km: int = 3000
    last_serviced_at: Optional[datetime] = None

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
    # Gates the DM "Message" button on its own (one-directional, Twitter-
    # style) - you don't need this person to follow you back to message
    # them, just to follow them yourself.
    is_followed_by_me: bool = False
    # Informational only now (not a DM gate) - whether this profile follows
    # the viewer back.
    follows_me: bool = False
    is_private: bool = False
    # True when the viewer has an outstanding follow request into this
    # (private) profile that hasn't been accepted/rejected yet - lets the
    # frontend show "Requested" instead of "Follow".
    has_pending_follow_request: bool = False
    privacy_zone_radius_km: Optional[float] = None
    is_verified_rider: bool = False
    # Real column on the model, used internally for moderation/verify-rider
    # gating (routers/users.py, moderation.py) but never actually exposed
    # here until now — every admin-gated UI element on both frontends has
    # been silently unreachable via this field for the whole build.
    is_admin: bool = False

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
    is_private: Optional[bool] = None
    privacy_zone_radius_km: Optional[float] = Field(default=None, ge=0, le=50)


class BikeUpdate(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    year: Optional[int] = None
    engine_cc: Optional[int] = None
    mileage_kmpl: Optional[float] = None
    type: Optional[BikeType] = None
    service_interval_km: Optional[int] = None


class UserStatsOut(BaseModel):
    rides_captained: int
    rides_joined: int
    rides_completed: int


class PushTokenRegister(BaseModel):
    token: str = Field(min_length=1, max_length=255)
    platform: Optional[str] = Field(default=None, max_length=20)
