"""Destination, Tag, DestinationTag, DestinationMedia, Rating — the M1 core of the flywheel."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class TerrainDifficulty(str, enum.Enum):
    chill = "chill"
    moderate = "moderate"
    rough = "rough"


class TagCategory(str, enum.Enum):
    vibe = "vibe"
    vehicle_fit = "vehicle_fit"


class Destination(Base):
    __tablename__ = "destinations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    region = Column(String(100), nullable=True)
    country = Column(String(100), nullable=False, default="India")
    currency = Column(String(3), nullable=False, default="INR")
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    terrain_difficulty = Column(
        SQLEnum(TerrainDifficulty, name="terrain_difficulty"),
        nullable=False,
        default=TerrainDifficulty.moderate,
    )
    estimated_food_cost = Column(Integer, nullable=True)
    estimated_entry_cost = Column(Integer, nullable=True)
    best_season = Column(String(100), nullable=True)
    best_time_of_day = Column(String(50), nullable=True)
    hero_media_url = Column(String(500), nullable=True)
    avg_rating = Column(Float, nullable=False, default=0.0)
    rating_count = Column(Integer, nullable=False, default=0)
    submitted_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("idx_destinations_region", "region"),
        Index("idx_destinations_latlng", "latitude", "longitude"),
    )

    submitter = relationship("User", back_populates="submitted_destinations")
    tags = relationship(
        "DestinationTag", back_populates="destination", cascade="all, delete-orphan"
    )
    media = relationship(
        "DestinationMedia", back_populates="destination", cascade="all, delete-orphan"
    )
    routes = relationship(
        "Route", back_populates="destination", cascade="all, delete-orphan"
    )
    ride_plans = relationship("RidePlan", back_populates="destination")
    ratings = relationship(
        "Rating", back_populates="destination", cascade="all, delete-orphan"
    )
    discussions = relationship(
        "Discussion", back_populates="destination", cascade="all, delete-orphan"
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(50), nullable=False, unique=True)
    label = Column(String(100), nullable=False)
    category = Column(SQLEnum(TagCategory, name="tag_category"), nullable=False)

    destinations = relationship(
        "DestinationTag", back_populates="tag", cascade="all, delete-orphan"
    )


class DestinationTag(Base):
    __tablename__ = "destination_tags"

    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    destination = relationship("Destination", back_populates="tags")
    tag = relationship("Tag", back_populates="destinations")


class DestinationMedia(Base):
    __tablename__ = "destination_media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        nullable=False,
    )
    url = Column(String(500), nullable=False)
    caption = Column(String(500), nullable=True)
    # Phase 4 W3 — see RideMedia.thumbnail_url.
    thumbnail_url = Column(String(500), nullable=True)
    uploaded_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    destination = relationship("Destination", back_populates="media")
    uploader = relationship("User", back_populates="uploaded_destination_media")
    ride_log = relationship("RideLog", back_populates="destination_media_links")


class Rating(Base):
    __tablename__ = "ratings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    stars = Column(Integer, nullable=False)
    review = Column(Text, nullable=True)
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint("destination_id", "user_id", name="uq_rating_destination_user"),
        CheckConstraint("stars >= 1 AND stars <= 5", name="ck_rating_stars_range"),
    )

    destination = relationship("Destination", back_populates="ratings")
    user = relationship("User", back_populates="ratings")
    ride_log = relationship("RideLog", back_populates="rating")
