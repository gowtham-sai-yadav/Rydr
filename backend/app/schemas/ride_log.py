"""Pydantic schemas for RideLog + RideMedia.

Extended in M4 with:
  - ``RideLogCreate`` reduced to ``ride_plan_id`` only (rider_id from auth,
    actual_start_ts auto-defaulted server-side to now()).
  - ``RideLogOut`` now embeds optional ``RatingOut`` for the rating linked via
    ``ride_logs.rating`` relationship.
  - ``RideLogListResponse`` paginated wrapper.
  - ``RideMediaConfirm`` for the post-Cloudinary-upload confirm step, with
    optional ``link_to_destination`` to back-populate the destination's media
    gallery (the M4 flywheel).
  - ``CloudinarySignature`` for the signed-upload response.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.ride_log import MediaType, RoadCondition
from app.schemas.user import UserBrief


MAX_NOTES_LEN = 5000
MAX_CAPTION_LEN = 500
MAX_MEDIA_URL_LEN = 500


class RideMediaOut(BaseModel):
    id: UUID
    ride_log_id: UUID
    url: str
    media_type: MediaType
    uploaded_by_user_id: Optional[UUID] = None
    caption: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RideMediaConfirm(BaseModel):
    """Frontend posts this after the direct-to-Cloudinary upload finishes.

    ``url`` is whatever Cloudinary returned (``secure_url``). For dev / smoke
    tests without Cloudinary configured, any ``https://`` URL is accepted.
    """

    url: str = Field(min_length=1, max_length=MAX_MEDIA_URL_LEN)
    media_type: MediaType = MediaType.image
    caption: Optional[str] = Field(default=None, max_length=MAX_CAPTION_LEN)
    # Flywheel: also create a DestinationMedia row pointing at this URL.
    link_to_destination: bool = True

    @field_validator("url")
    @classmethod
    def _https_only(cls, v: str) -> str:
        if not v.startswith("https://"):
            raise ValueError("media url must start with https://")
        return v


class RatingBrief(BaseModel):
    """Tiny rating shape embedded on RideLogOut — full RatingOut lives in
    schemas/destination but importing it here would create a cycle."""

    id: UUID
    destination_id: UUID
    stars: int
    review: Optional[str] = None

    class Config:
        from_attributes = True


class RideLogOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    rider_id: UUID
    actual_start_ts: Optional[datetime] = None
    actual_end_ts: Optional[datetime] = None
    actual_cost: Optional[int] = None
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    media: List[RideMediaOut] = []
    rider: Optional[UserBrief] = None
    rating: Optional[RatingBrief] = None

    class Config:
        from_attributes = True


class RideLogListResponse(BaseModel):
    logs: List[RideLogOut] = []
    total: int
    page: int
    limit: int


class RideLogCreate(BaseModel):
    ride_plan_id: UUID
    # Optional override — defaults to now() server-side. Useful when a rider
    # forgot to log mid-ride and logs the next day.
    actual_start_ts: Optional[datetime] = None


class RideLogUpdate(BaseModel):
    actual_start_ts: Optional[datetime] = None
    actual_end_ts: Optional[datetime] = None
    actual_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=MAX_NOTES_LEN)


class CloudinarySignature(BaseModel):
    cloud_name: str
    api_key: str
    timestamp: int
    folder: str
    signature: str
    upload_url: str
    max_image_bytes: int
    max_video_bytes: int
    # Echo back so the client can show "uploading for ride X" UI without
    # extra round-trips.
    ride_log_id: UUID

    # Mirror the assumption surface from M2 CostEstimate: anything not in
    # the strict types above gets stuffed in here for forward-compat.
    extras: Dict[str, Any] = {}


class RideSummary(BaseModel):
    """Everything a share card needs about one completed ride — Phase 4 W4.

    Deliberately flat and pre-formatted rather than a nested object graph.
    The consumers are a card renderer and a share sheet, both of which want
    "the string to draw", not a model to traverse. Keeping the formatting
    decisions server-side also means the web card and the Android card cannot
    drift apart.
    """

    ride_log_id: UUID
    ride_plan_id: UUID

    rider_name: str
    rider_avatar_url: Optional[str] = None

    destination_id: UUID
    destination_name: str
    destination_region: Optional[str] = None

    ride_title: str
    ride_date: date

    # Derived, not measured — see services/stats for why. Named to match.
    estimated_distance_km: float
    # None when the rider did not record start/end timestamps on the log.
    duration_minutes: Optional[int] = None
    actual_cost: Optional[int] = None
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None

    rider_count: int
    photo_count: int
    stars: Optional[int] = None
