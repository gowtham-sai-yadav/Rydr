"""Pydantic schemas for Destination + Tag + DestinationMedia + Rating."""
from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.destination import TagCategory, TerrainDifficulty


class TagOut(BaseModel):
    id: UUID
    slug: str
    label: str
    category: TagCategory

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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


class RatingOut(BaseModel):
    id: UUID
    destination_id: UUID
    user_id: UUID
    stars: int
    review: Optional[str] = None
    ride_log_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RatingCreate(BaseModel):
    stars: int = Field(ge=1, le=5)
    review: Optional[str] = None
    ride_log_id: Optional[UUID] = None
