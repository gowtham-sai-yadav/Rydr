"""Event - an organized public ride/meetup with RSVP, a date, and a
meeting point. Distinct from RidePlan: an Event doesn't have the
captain-approval participant flow, just an open RSVP list, and it can
be club-scoped or open to everyone."""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class RSVPStatus(str, enum.Enum):
    going = "going"
    interested = "interested"


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    club_id = Column(UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=True)
    destination_id = Column(UUID(as_uuid=True), ForeignKey("destinations.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    event_date = Column(DateTime(timezone=True), nullable=False)
    meeting_point = Column(String(255), nullable=True)
    meeting_latitude = Column(Float, nullable=True)
    meeting_longitude = Column(Float, nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    club = relationship("Club", back_populates="events")
    destination = relationship("Destination")
    creator = relationship("User")
    rsvps = relationship("EventRSVP", back_populates="event", cascade="all, delete-orphan")


class EventRSVP(Base):
    __tablename__ = "event_rsvps"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(RSVPStatus, name="rsvp_status"), nullable=False, default=RSVPStatus.going)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_event_rsvp"),
    )

    event = relationship("Event", back_populates="rsvps")
    user = relationship("User")
