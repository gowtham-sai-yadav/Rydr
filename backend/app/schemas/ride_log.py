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
    captured_latitude: Optional[float] = None
    captured_longitude: Optional[float] = None
    captured_at: Optional[datetime] = None
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
    # Auto-recorded track stats — populated when the rider submits a
    # recorded_track (see track_analysis.py); null for manually-logged
    # rides with no GPS track.
    distance_km: Optional[float] = None
    moving_duration_seconds: Optional[int] = None
    avg_speed_kmh: Optional[float] = None
    elevation_gain_m: Optional[float] = None
    terrain_type: Optional[str] = None
    relative_effort: Optional[int] = None
    matched_route_id: Optional[UUID] = None
    recorded_track: Optional[List[Dict[str, Any]]] = None
    created_at: datetime
    updated_at: datetime
    media: List[RideMediaOut] = []
    rider: Optional[UserBrief] = None
    rating: Optional[RatingBrief] = None
    # Populated only right after a recorded_track submission that broke a
    # record — e.g. ["longest_ride", "best_month"] — so the frontend can
    # pop a "New PR!" moment immediately after logging. Empty otherwise.
    new_personal_records: List[str] = []

    class Config:
        from_attributes = True


class RideLogSummary(BaseModel):
    """Shareable-card data - Phase 4. ``distance_km`` is always ``None``
    today: ``ride_logs`` has no distance column (route distance isn't
    tracked anywhere in the current schema), so this is a placeholder for
    when that lands rather than an invented field. ``duration_minutes`` is
    derived from ``actual_end_ts - actual_start_ts`` when both are set."""

    ride_log_id: UUID
    rider_name: str
    destination_name: Optional[str] = None
    distance_km: Optional[float] = None
    duration_minutes: Optional[int] = None
    ride_date: Optional[date] = None
    photo_url: Optional[str] = None


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


class TrackPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    ts: Optional[str] = None
    speed_kmh: Optional[float] = None


class RideLogUpdate(BaseModel):
    actual_start_ts: Optional[datetime] = None
    actual_end_ts: Optional[datetime] = None
    actual_cost: Optional[int] = Field(default=None, ge=0, le=1_000_000)
    road_condition: Optional[RoadCondition] = None
    recommended: Optional[bool] = None
    notes: Optional[str] = Field(default=None, max_length=MAX_NOTES_LEN)
    # Submitting this triggers services/track_analysis.py to (re)compute
    # distance_km/moving_duration_seconds/avg_speed_kmh/elevation_gain_m/
    # terrain_type/relative_effort server-side — those derived fields
    # aren't independently settable, only recorded_track is accepted here.
    recorded_track: Optional[List[TrackPoint]] = Field(default=None, max_length=20000)


class RideLogCommentOut(BaseModel):
    id: UUID
    ride_log_id: UUID
    body: str
    created_at: datetime
    author: UserBrief

    class Config:
        from_attributes = True


class RideLogCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class RideLogCommentListResponse(BaseModel):
    comments: List[RideLogCommentOut] = []


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


class TimelineEntryOut(BaseModel):
    """One photo in a rider's photo-tagged timeline — a RideMedia row
    plus enough ride/destination context to place it on a map and in a
    chronological feed without a second round-trip per photo."""

    media_id: UUID
    url: str
    media_type: MediaType
    caption: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    taken_at: datetime
    ride_log_id: UUID
    ride_plan_id: UUID
    destination_name: Optional[str] = None


class TimelineResponse(BaseModel):
    entries: List[TimelineEntryOut] = []


class MyRideLogOut(BaseModel):
    """Trimmed shape for pickers (e.g. "add this ride as a trip day") —
    enough to identify and label a ride log without the full detail
    payload (media, comments, recorded_track)."""

    id: UUID
    ride_plan_id: UUID
    destination_name: Optional[str] = None
    distance_km: Optional[float] = None
    actual_start_ts: Optional[datetime] = None
    thumbnail_url: Optional[str] = None


class MyRideLogListResponse(BaseModel):
    logs: List[MyRideLogOut] = []


class FlybyOut(BaseModel):
    rider: UserBrief
    other_ride_log_id: UUID
    closest_distance_km: float
    approx_time: Optional[datetime] = None


class FlybyListResponse(BaseModel):
    flybys: List[FlybyOut] = []
