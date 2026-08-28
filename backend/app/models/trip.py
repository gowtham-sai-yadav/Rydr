"""Trip - groups a sequence of RideLogs into one multi-day tour with
combined stats and one shareable recap, instead of N separate ride logs."""
from __future__ import annotations

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Trip(Base):
    __tablename__ = "trips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    owner = relationship("User")
    ride_logs = relationship(
        "TripRideLog", back_populates="trip", cascade="all, delete-orphan",
        order_by="TripRideLog.day_index",
    )


class TripRideLog(Base):
    __tablename__ = "trip_ride_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    trip_id = Column(UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False)
    ride_log_id = Column(
        UUID(as_uuid=True), ForeignKey("ride_logs.id", ondelete="CASCADE"), nullable=False
    )
    day_index = Column(Integer, nullable=False)  # 1, 2, 3... within the trip

    __table_args__ = (
        UniqueConstraint("trip_id", "ride_log_id", name="uq_trip_ride_log"),
    )

    trip = relationship("Trip", back_populates="ride_logs")
    ride_log = relationship("RideLog")
