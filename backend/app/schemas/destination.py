"""Pydantic schemas for Destination + Tag + DestinationMedia + Rating.

Extended in M2 with: list / rating-list / cost-estimate / tag-grouped response
wrappers, recent-rider fields on the detail, and ``gallery_urls`` on submission.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.destination import TagCategory, TerrainDifficulty
from app.schemas.ride import UserBrief


class TagOut(BaseModel):
    id: UUID
    slug: str
    label: str
    category: TagCategory

    class Config:
        from_attributes = True


class TagListResponse(BaseModel):
    vibe: List[TagOut] = []
    vehicle_fit: List[TagOut] = []


class DestinationMediaOut(BaseModel):
    id: UUID
    destination_id: UUID
    url: str
    caption: Optional[str] = None
    uploaded_by_user_id: Optional[UUID] = None
    ride_log_id: Optional[UUID] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DestinationMediaListResponse(BaseModel):
    media: List[DestinationMediaOut] = []
    total: int
    page: int
    limit: int


class DestinationSummary(BaseModel):
    """Lightweight shape — used in feeds and embedded references."""

    id: UUID
    name: str
    region: Optional[str] = None
    country: str
    currency: str
    latitude: float
    longitude: float
    terrain_difficulty: TerrainDifficulty
    hero_media_url: Optional[str] = None
    avg_rating: float
    rating_count: int
    # Optional — populated when the list query has an origin (sort=distance
    # or radius_km filter) so the UI can render "X km away".
    distance_km: Optional[float] = None

    class Config:
        from_attributes = True


class DestinationListResponse(BaseModel):
    destinations: List[DestinationSummary] = []
    total: int
    page: int
    limit: int


class DestinationOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    region: Optional[str] = None
    country: str
    currency: str
    latitude: float
    longitude: float
    terrain_difficulty: TerrainDifficulty
    estimated_food_cost: Optional[int] = None
    estimated_entry_cost: Optional[int] = None
    best_season: Optional[str] = None
    best_time_of_day: Optional[str] = None
    hero_media_url: Optional[str] = None
    avg_rating: float
    rating_count: int
    submitted_by_user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    tags: List[TagOut] = []
    media: List[DestinationMediaOut] = []
    # M2 — community signal: distinct riders w/ RideLog in the last 90 days.
    recent_rider_count: int = 0
    recent_riders: List[UserBrief] = []

    class Config:
        from_attributes = True


class DestinationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    region: Optional[str] = None
    country: str = "India"
    currency: str = Field(default="INR", min_length=3, max_length=3)
    latitude: float
    longitude: float
    terrain_difficulty: TerrainDifficulty = TerrainDifficulty.moderate
    estimated_food_cost: Optional[int] = None
    estimated_entry_cost: Optional[int] = None
    best_season: Optional[str] = None
    best_time_of_day: Optional[str] = None
    hero_media_url: Optional[str] = None
    tag_slugs: List[str] = []
    gallery_urls: List[str] = []


class RatingOut(BaseModel):
    id: UUID
    destination_id: UUID
    user_id: UUID
    stars: int
    review: Optional[str] = None
    ride_log_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class RatingListResponse(BaseModel):
    ratings: List[RatingOut] = []
    total: int
    page: int
    limit: int


class RatingCreate(BaseModel):
    stars: int = Field(ge=1, le=5)
    review: Optional[str] = None
    ride_log_id: Optional[UUID] = None


class CostEstimate(BaseModel):
    distance_km: float
    fuel_inr: Optional[int] = None
    food_inr: int
    entry_inr: int
    total_inr_low: int
    total_inr_high: int
    currency: str
    assumptions: Dict[str, Any] = {}
