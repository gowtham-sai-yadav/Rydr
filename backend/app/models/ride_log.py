"""RideLog + RideMedia — the executed-ride half of the flywheel."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class RoadCondition(str, enum.Enum):
    good = "good"
    ok = "ok"
    rough = "rough"
    bad = "bad"


class MediaType(str, enum.Enum):
    image = "image"
    video = "video"


class RideLog(Base):
    __tablename__ = "ride_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_plan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    rider_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    actual_start_ts = Column(DateTime(timezone=True), nullable=True)
    actual_end_ts = Column(DateTime(timezone=True), nullable=True)
    actual_cost = Column(Integer, nullable=True)
    road_condition = Column(
        SQLEnum(RoadCondition, name="road_condition"), nullable=True
    )
    recommended = Column(Boolean, nullable=True)
    notes = Column(Text, nullable=True)

    # Track/telemetry fields - populated either by the browser-Geolocation
    # auto-recorder (foreground only - no native background GPS exists
    # since the Android wrap hasn't happened) or entered manually. All
    # nullable: a manually-logged ride with no recorded track has none of
    # this, and every downstream feature (PRs, effort score, gear
    # tracking, heatmaps) treats absence as "unknown", not zero.
    distance_km = Column(Float, nullable=True)
    moving_duration_seconds = Column(Integer, nullable=True)  # excludes auto-paused stops
    avg_speed_kmh = Column(Float, nullable=True)
    elevation_gain_m = Column(Float, nullable=True)
    terrain_type = Column(String(20), nullable=True)  # hill | coastal | flat | mixed
    # 1-100, computed from distance/duration/terrain - see services/effort.py.
    relative_effort = Column(Integer, nullable=True)
    # Route matching: set when this ride's recorded_track lines up with a
    # published Route (see services/route_matching.py). Powers "best
    # efforts" (repeatable-loop timing) since that needs to know two rides
    # are the *same* route to compare them.
    matched_route_id = Column(
        UUID(as_uuid=True), ForeignKey("routes.id", ondelete="SET NULL"), nullable=True
    )
    # [{lat, lng, ts, photo_url?}, ...] recorded by the browser tracker.
    # JSONB rather than a RidePoint-per-row table - a track is written once
    # (ride end) and read whole (map render), never queried point-by-point,
    # so a relational table just adds join overhead for no benefit here.
    recorded_track = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("ride_plan_id", "rider_id", name="uq_ride_log_ride_rider"),
    )

    ride_plan = relationship("RidePlan", back_populates="ride_logs")
    rider = relationship("User", back_populates="ride_logs")
    media = relationship(
        "RideMedia", back_populates="ride_log", cascade="all, delete-orphan"
    )
    rating = relationship("Rating", back_populates="ride_log", uselist=False)
    destination_media_links = relationship(
        "DestinationMedia", back_populates="ride_log"
    )
    posts = relationship("Post", back_populates="ride_log")
    comments = relationship(
        "RideLogComment", back_populates="ride_log", cascade="all, delete-orphan"
    )


class RideMedia(Base):
    __tablename__ = "ride_media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="CASCADE"),
        nullable=False,
    )
    url = Column(String(500), nullable=False)
    media_type = Column(
        SQLEnum(MediaType, name="media_type"),
        nullable=False,
        default=MediaType.image,
    )
    uploaded_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    caption = Column(String(500), nullable=True)
    # Photo-tagged timeline: where on the recorded track this was taken.
    # Null for photos uploaded without a live-recorded ride or without
    # location permission - the timeline UI just skips unplaced photos.
    captured_latitude = Column(Float, nullable=True)
    captured_longitude = Column(Float, nullable=True)
    captured_at = Column(DateTime(timezone=True), nullable=True)
    # Phase 4 W3. Derived from ``url`` for Cloudinary-hosted assets — the
    # first frame for video, a resized variant for images. Null for media
    # stored elsewhere, which means "render the original", not "missing".
    thumbnail_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ride_log = relationship("RideLog", back_populates="media")
    uploader = relationship("User", back_populates="uploaded_ride_media")


class RideLogComment(Base):
    """Flat comments on a logged ride ('what tires on that gravel bit?') -
    deliberately separate from Post/PostComment (feed posts) and
    Discussion/DiscussionComment (destination-wide threads): this is
    scoped to one specific ride's execution, not the destination or a
    social post about it."""

    __tablename__ = "ride_log_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ride_log = relationship("RideLog", back_populates="comments")
    author = relationship("User")
