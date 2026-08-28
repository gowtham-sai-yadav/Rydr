"""Pydantic schemas for Club, ClubMembership, ClubBadge, ClubChallenge."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.club import ClubRole
from app.schemas.user import UserBrief


class ClubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = Field(default=None, max_length=2000)
    city: Optional[str] = Field(default=None, max_length=100)
    avatar_url: Optional[str] = Field(default=None, max_length=500)


class ClubOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    city: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by_user_id: Optional[UUID] = None
    created_at: datetime
    member_count: int = 0
    is_member: bool = False
    my_role: Optional[ClubRole] = None

    class Config:
        from_attributes = True


class ClubListResponse(BaseModel):
    clubs: List[ClubOut] = []
    total: int
    page: int
    limit: int


class ClubMemberOut(BaseModel):
    user: UserBrief
    role: ClubRole
    joined_at: datetime


class ClubMemberListResponse(BaseModel):
    members: List[ClubMemberOut] = []


class ClubLeaderboardEntry(BaseModel):
    rank: int
    user: UserBrief
    distance_km: float
    ride_count: int


class ClubLeaderboardResponse(BaseModel):
    entries: List[ClubLeaderboardEntry] = []
    period: str  # "week" | "month"


class ClubBadgeCreate(BaseModel):
    slug: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=255)
    icon_url: Optional[str] = Field(default=None, max_length=500)


class ClubBadgeOut(BaseModel):
    id: UUID
    club_id: UUID
    slug: str
    name: str
    description: str
    icon_url: Optional[str] = None

    class Config:
        from_attributes = True


class ClubChallengeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    goal_km: float = Field(gt=0)
    start_date: date
    end_date: date
    reward_club_badge_id: Optional[UUID] = None


class ClubChallengeOut(BaseModel):
    id: UUID
    club_id: UUID
    title: str
    goal_km: float
    start_date: date
    end_date: date
    reward_club_badge_id: Optional[UUID] = None
    progress_km: float = 0
    is_complete: bool = False

    class Config:
        from_attributes = True


class ClubChallengeListResponse(BaseModel):
    challenges: List[ClubChallengeOut] = []
