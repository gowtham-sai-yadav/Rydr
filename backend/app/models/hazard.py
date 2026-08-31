"""HazardReport - crowd-sourced road hazards (pothole, gravel, police,
animal crossing) pinned to a location. Time-decaying: "active" is a
computed property (created_at within the type's decay window), not a
stored flag, so nothing needs a cron job to expire old reports."""
from __future__ import annotations

import enum
import uuid
from datetime import timedelta

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class HazardType(str, enum.Enum):
    pothole = "pothole"
    gravel = "gravel"
    police_check = "police_check"
    animal_crossing = "animal_crossing"
    accident = "accident"
    waterlogging = "waterlogging"
    other = "other"


# How long each hazard type stays "active" before it's considered stale.
# Transient ones (police checkpoints) decay in hours; road-condition ones
# (potholes, gravel) persist for weeks since they don't change fast.
HAZARD_DECAY = {
    HazardType.pothole: timedelta(days=30),
    HazardType.gravel: timedelta(days=14),
    HazardType.police_check: timedelta(hours=6),
    HazardType.animal_crossing: timedelta(hours=12),
    HazardType.accident: timedelta(hours=6),
    HazardType.waterlogging: timedelta(days=1),
    HazardType.other: timedelta(days=7),
}


class HazardReport(Base):
    __tablename__ = "hazard_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(UUID(as_uuid=True), ForeignKey("destinations.id", ondelete="CASCADE"), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    hazard_type = Column(SQLEnum(HazardType, name="hazard_type"), nullable=False)
    description = Column(Text, nullable=True)
    reported_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    destination = relationship("Destination")
    reporter = relationship("User")
