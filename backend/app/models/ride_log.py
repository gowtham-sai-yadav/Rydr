"""RideLog + RideMedia — the executed-ride half of the flywheel."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
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
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    ride_log = relationship("RideLog", back_populates="media")
    uploader = relationship("User", back_populates="uploaded_ride_media")
