"""User — extended in M1 with home_location + timestamps + relationships to new entities."""
from __future__ import annotations

import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False, index=True)
    phone = Column(String(20), nullable=True)
    password_hash = Column(String(255), nullable=False)
    avatar_url = Column(String(500), nullable=True)
    bio = Column(Text, nullable=True)

    # Moderation — grants access to /api/moderation admin-only endpoints.
    is_admin = Column(Boolean, nullable=False, server_default="false", default=False)

    # Home location — used by M2 radius filter + cost calculator
    home_city = Column(String(100), nullable=True)
    home_latitude = Column(Float, nullable=True)
    home_longitude = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # One-to-one: bike
    bike = relationship(
        "Bike",
        back_populates="owner",
        uselist=False,
        cascade="all, delete-orphan",
    )

    # Ride plans / logs
    captained_ride_plans = relationship("RidePlan", back_populates="captain")
    ride_plan_participations = relationship(
        "RidePlanParticipant", back_populates="user", cascade="all, delete-orphan"
    )
    ride_logs = relationship(
        "RideLog", back_populates="rider", cascade="all, delete-orphan"
    )
    uploaded_ride_media = relationship("RideMedia", back_populates="uploader")

    # Destinations
    submitted_destinations = relationship("Destination", back_populates="submitter")
    uploaded_destination_media = relationship(
        "DestinationMedia", back_populates="uploader"
    )
    created_routes = relationship("Route", back_populates="creator")
    ratings = relationship(
        "Rating", back_populates="user", cascade="all, delete-orphan"
    )

    # Social
    following = relationship(
        "Follow",
        foreign_keys="Follow.follower_id",
        back_populates="follower",
        cascade="all, delete-orphan",
    )
    followers = relationship(
        "Follow",
        foreign_keys="Follow.followed_id",
        back_populates="followed",
        cascade="all, delete-orphan",
    )
    discussions = relationship(
        "Discussion", back_populates="author", cascade="all, delete-orphan"
    )
    discussion_comments = relationship(
        "DiscussionComment", back_populates="author", cascade="all, delete-orphan"
    )

    # Badges
    user_badges = relationship(
        "UserBadge", back_populates="user", cascade="all, delete-orphan"
    )

    # Notifications
    notifications = relationship(
        "Notification",
        foreign_keys="Notification.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )
