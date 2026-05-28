"""Pydantic schemas for Destination + Tag + DestinationMedia + Rating.

Extended in M2 with: list / rating-list / cost-estimate / tag-grouped response
wrappers, recent-rider fields on the detail, and ``gallery_urls`` on submission.
Audit pass tightened payload bounds, renamed currency-leaking cost fields,
and added a ``fuel_included`` flag.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.destination import TagCategory, TerrainDifficulty
from app.schemas.user import UserBrief


MAX_GALLERY_URLS = 20
MAX_TAG_SLUGS = 20
MAX_REVIEW_LEN = 2000
MAX_MEDIA_URL_LEN = 500  # mirrors DestinationMedia.url column width


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
    description: Optional[str] = Field(default=None, max_length=5000)
    region: Optional[str] = Field(default=None, max_length=100)
    country: str = Field(default="India", max_length=100)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    terrain_difficulty: TerrainDifficulty = TerrainDifficulty.moderate
    estimated_food_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    estimated_entry_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    best_season: Optional[str] = Field(default=None, max_length=100)
    best_time_of_day: Optional[str] = Field(default=None, max_length=50)
    hero_media_url: Optional[str] = Field(default=None, max_length=MAX_MEDIA_URL_LEN)
    tag_slugs: List[str] = Field(default_factory=list, max_length=MAX_TAG_SLUGS)
    gallery_urls: List[str] = Field(default_factory=list, max_length=MAX_GALLERY_URLS)

    @field_validator("gallery_urls")
    @classmethod
    def _check_gallery_urls(cls, v: List[str]) -> List[str]:
        for url in v:
            if len(url) > MAX_MEDIA_URL_LEN:
                raise ValueError(
                    f"gallery_urls entry exceeds {MAX_MEDIA_URL_LEN} chars"
                )
            if not url.startswith(("http://", "https://")):
                raise ValueError("gallery_urls entries must be http(s) URLs")
        return v

    @field_validator("tag_slugs")
    @classmethod
    def _no_duplicate_slugs(cls, v: List[str]) -> List[str]:
        if len(set(v)) != len(v):
            raise ValueError("duplicate tag slugs are not allowed")
        return v


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
    review: Optional[str] = Field(default=None, max_length=MAX_REVIEW_LEN)
    ride_log_id: Optional[UUID] = None


class CostEstimate(BaseModel):
    """Per-user cost estimate. Field names are currency-neutral — the actual
    currency lives in the ``currency`` field. ``total_low``/``total_high`` are
    null when fuel cannot be estimated (no bike / no mileage) so the UI can
    surface an explicit "add your bike" CTA instead of misleading numbers.
    """

    distance_km: float
    fuel: Optional[int] = None
    food: int
    entry: int
    total_low: Optional[int] = None
    total_high: Optional[int] = None
    currency: str
    fuel_included: bool
    assumptions: Dict[str, Any] = {}
