import uuid
from sqlalchemy import Column, String, Text, Integer, Float, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class RideStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


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
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    name = Column(String(100), nullable=True)
    model = Column(String(100), nullable=True)
    year = Column(Integer, nullable=True)

    owner = relationship("User", back_populates="bike")


class Ride(Base):
    __tablename__ = "rides"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    captain_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    ride_date = Column(String(20), nullable=False)
    start_time = Column(String(10), nullable=False)
    estimated_end_time = Column(String(10), nullable=True)
    difficulty_level = Column(SQLEnum(DifficultyLevel), default=DifficultyLevel.moderate)
    recommended_bike_type = Column(String(100), nullable=True)
    break_schedule = Column(Text, nullable=True)
    status = Column(SQLEnum(RideStatus), default=RideStatus.open)
    max_riders = Column(Integer, default=10)

    captain = relationship("User", back_populates="captained_rides")
    stops = relationship("RideStop", back_populates="ride", cascade="all, delete-orphan", order_by="RideStop.stop_order")
    participants = relationship("RideParticipant", back_populates="ride", cascade="all, delete-orphan")
    chat_group = relationship("ChatGroup", back_populates="ride", uselist=False, cascade="all, delete-orphan")


class RideStop(Base):
    __tablename__ = "ride_stops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id = Column(UUID(as_uuid=True), ForeignKey("rides.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    stop_order = Column(Integer, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_break_stop = Column(Boolean, default=False)

    ride = relationship("Ride", back_populates="stops")


class RideParticipant(Base):
    __tablename__ = "ride_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ride_id = Column(UUID(as_uuid=True), ForeignKey("rides.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(SQLEnum(ParticipantStatus), default=ParticipantStatus.pending)

    ride = relationship("Ride", back_populates="participants")
    user = relationship("User", back_populates="participations")
