"""Bike + RidePlan + RidePlanParticipant.

Renamed from the PoC's `Ride` model in M1 — now anchors to a Destination.
Date/time columns migrated from String to proper Date/Time types.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
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
    # Phase 4 W6: captain has said yes but the ride is at ``max_riders``.
    # Promoted to ``approved`` automatically by
    # ``services/ride_capacity.promote_from_waitlist`` when a seat frees.
    waitlisted = "waitlisted"


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
    # Gear tracking - cumulative km/rides since either the bike was added
    # or the last service reset. Updated in ride_logs.py whenever a ride
    # log gets a distance_km. service_interval_km is user-set (defaults to
    # a common chain/tyre-check interval); the "due for service" signal is
    # `total_km_since_service >= service_interval_km`, computed in the API
    # layer rather than stored, so changing the interval doesn't need a
    # backfill.
    total_km_since_service = Column(Float, nullable=False, default=0)
    total_km_lifetime = Column(Float, nullable=False, default=0)
    service_interval_km = Column(Integer, nullable=False, default=3000)
    last_serviced_at = Column(DateTime(timezone=True), nullable=True)

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
    # Null = no cap ("no limit" option on ride creation). No client-side
    # `default=` here deliberately - SQLAlchemy applies a Column default
    # whenever the value is None at flush time, whether that None was
    # explicit ("no limit" - what we need to preserve) or just omitted.
    # The 10-rider default for the omitted case lives in RidePlanCreate
    # (the API boundary) instead, where "not provided" is distinguishable.
    max_riders = Column(Integer, nullable=True)
    # False = join requests are auto-approved (capacity permitting) instead
    # of sitting pending for the captain to act on.
    requires_approval = Column(Boolean, nullable=False, default=True, server_default=text("true"))
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

    __table_args__ = (
        # M6 audit #4: index supports both ``/api/rides/mine`` (filters on
        # ``captain_id``) and the M6 ``/api/rides/feed?following_only=true``
        # path (``captain_id IN (subquery)``). ``planned_date DESC`` is folded
        # in so the planner can serve the typical "upcoming first" sort from
        # the index without a separate Sort step. Postgres doesn't auto-index
        # FK columns, so the M1 schema was missing this.
        Index(
            "idx_ride_plans_captain_planned_date",
            "captain_id",
            text("planned_date DESC"),
        ),
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
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "ride_plan_id", "user_id", name="uq_participant_ride_user"
        ),
    )

    ride_plan = relationship("RidePlan", back_populates="participants")
    user = relationship("User", back_populates="ride_plan_participations")
