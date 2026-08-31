"""Leaderboard + personal dashboard schemas — Phase 4 W5."""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel

from app.schemas.user import UserBrief


class RiderLeaderboardEntry(BaseModel):
    rank: int
    user_id: UUID
    name: str
    avatar_url: Optional[str] = None
    rides: int
    # Named "estimated" throughout: Rydr has no GPS track, so this is
    # home -> destination -> home great-circle, not a measured distance.
    estimated_distance_km: float


class RiderLeaderboardResponse(BaseModel):
    period: str
    entries: List[RiderLeaderboardEntry] = []
    # Where the caller sits, even when they're outside the returned page.
    # None when the caller is anonymous or has no completed rides.
    my_rank: Optional[int] = None


class DestinationLeaderboardEntry(BaseModel):
    rank: int
    destination_id: UUID
    name: str
    region: Optional[str] = None
    hero_media_url: Optional[str] = None
    avg_rating: float
    ride_count: int
    unique_riders: int


class DestinationLeaderboardResponse(BaseModel):
    period: str
    entries: List[DestinationLeaderboardEntry] = []


class PersonalStatsOut(BaseModel):
    rides_captained: int
    rides_joined: int
    rides_completed: int
    total_distance_km: float
    distance_this_week_km: float
    distance_this_month_km: float
    rides_this_week: int
    rides_this_month: int
    longest_ride_km: float
    current_streak_weeks: int
    longest_streak_weeks: int
    destinations_visited: int
    # False means every distance above is zero because there's nothing to
    # measure from — the client should prompt for a home location rather than
    # showing "0 km ridden".
    has_home_location: bool


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
