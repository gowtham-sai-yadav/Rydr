"""Pydantic schemas for the leaderboard endpoints (Phase 4 W5)."""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.schemas.user import UserBrief


class RiderLeaderboardEntry(BaseModel):
    rank: int
    user: UserBrief
    rides_logged: int


class RiderLeaderboardResponse(BaseModel):
    entries: List[RiderLeaderboardEntry] = []


class DestinationLeaderboardEntry(BaseModel):
    rank: int
    destination_id: UUID
    destination_name: str
    ride_count: int


class DestinationLeaderboardResponse(BaseModel):
    entries: List[DestinationLeaderboardEntry] = []


class LocalLegendOut(BaseModel):
    destination_id: UUID
    user: Optional[UserBrief] = None
    ride_count: int = 0
    window_days: int = 90


class WeeklyLeagueTier(BaseModel):
    tier: str  # "gold" | "silver" | "bronze"
    rank: int
    user: UserBrief
    distance_km: float


class WeeklyLeagueResponse(BaseModel):
    week_start: str
    tiers: List[WeeklyLeagueTier] = []
