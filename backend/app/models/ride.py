"""Bike + RidePlan + RidePlanParticipant.

Renamed from the PoC's `Ride` model in M1 — now anchors to a Destination.
Date/time columns migrated from String to proper Date/Time types.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class BikeType(str, enum.Enum):
    commuter = "commuter"
    sport = "sport"
    adventure = "adventure"
    cruiser = "cruiser"
    any = "any"


class RidePlanStatus(str, enum.Enum):
    planned = "planned"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class RidePlanVisibility(str, enum.Enum):
    solo = "solo"
    group = "group"


class DifficultyLevel(str, enum.Enum):
    easy = "easy"
    moderate = "moderate"
    hard = "hard"
    expert = "expert"


class ParticipantStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    left = "left"


class Bike(Base):
    __tablename__ = "bikes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    name = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)
    engine_cc = Column(Integer, nullable=True)
    mileage_kmpl = Column(Float, nullable=True)
    type = Column(
        SQLEnum(BikeType, name="bike_type"),
        nullable=False,
        default=BikeType.any,
    )

    owner = relationship("User", back_populates="bike")


class RidePlan(Base):
    __tablename__ = "ride_plans"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    route_id = Column(
        UUID(as_uuid=True),
        ForeignKey("routes.id", ondelete="SET NULL"),
        nullable=True,
    )
    captain_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    planned_date = Column(Date, nullable=False)
    planned_start_time = Column(Time, nullable=False)
    estimated_end_time = Column(Time, nullable=True)
    visibility = Column(
        SQLEnum(RidePlanVisibility, name="ride_plan_visibility"),
        nullable=False,
        default=RidePlanVisibility.group,
    )
    difficulty_level = Column(
        SQLEnum(DifficultyLevel, name="difficulty_level"),
        nullable=False,
        default=DifficultyLevel.moderate,
    )
    recommended_bike_type = Column(String(100), nullable=True)
    break_schedule = Column(Text, nullable=True)
    max_riders = Column(Integer, nullable=False, default=10)
    status = Column(
        SQLEnum(RidePlanStatus, name="ride_plan_status"),
        nullable=False,
        default=RidePlanStatus.planned,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    destination = relationship("Destination", back_populates="ride_plans")
    route = relationship("Route", back_populates="ride_plans")
    captain = relationship("User", back_populates="captained_ride_plans")
    participants = relationship(
        "RidePlanParticipant",
        back_populates="ride_plan",
        cascade="all, delete-orphan",
    )
    ride_logs = relationship(
        "RideLog", back_populates="ride_plan", cascade="all, delete-orphan"
    )
    chat_group = relationship(
        "ChatGroup",
        back_populates="ride_plan",
        uselist=False,
        cascade="all, delete-orphan",
    )


class RidePlanParticipant(Base):
    __tablename__ = "ride_plan_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_plan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_plans.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    status = Column(
        SQLEnum(ParticipantStatus, name="participant_status"),
        nullable=False,
        default=ParticipantStatus.pending,
    )

    ride_plan = relationship("RidePlan", back_populates="participants")
    user = relationship("User", back_populates="ride_plan_participations")
