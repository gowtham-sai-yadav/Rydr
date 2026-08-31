"""Club - persistent joinable groups (a city, a bike brand, a riding
style), separate from one-off group rides. Plus club-scoped badges and
monthly challenges, which only make sense once a persistent membership
exists to scope them to."""
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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ClubRole(str, enum.Enum):
    member = "member"
    admin = "admin"


class Club(Base):
    __tablename__ = "clubs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(150), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    creator = relationship("User")
    memberships = relationship("ClubMembership", back_populates="club", cascade="all, delete-orphan")
    badges = relationship("ClubBadge", back_populates="club", cascade="all, delete-orphan")
    challenges = relationship("ClubChallenge", back_populates="club", cascade="all, delete-orphan")
    # events.club_id is declared ondelete="CASCADE"; without a matching
    # ORM cascade SQLAlchemy NULLs the FK before the database ever sees
    # the delete, leaving club-less events behind instead of removing
    # them. The two have to agree.
    events = relationship("Event", back_populates="club",
                          cascade="all, delete-orphan")


class ClubMembership(Base):
    __tablename__ = "club_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    club_id = Column(UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(SQLEnum(ClubRole, name="club_role"), nullable=False, default=ClubRole.member)
    joined_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("club_id", "user_id", name="uq_club_membership"),
    )

    club = relationship("Club", back_populates="memberships")
    user = relationship("User")


class ClubBadge(Base):
    """A club's own custom badge design - separate from the global Badge
    catalog since only that club's members can ever earn it."""

    __tablename__ = "club_badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    club_id = Column(UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False)
    slug = Column(String(50), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=False)
    icon_url = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("club_id", "slug", name="uq_club_badge_slug"),
    )

    club = relationship("Club", back_populates="badges")
    awards = relationship("UserClubBadge", back_populates="club_badge", cascade="all, delete-orphan")


class UserClubBadge(Base):
    __tablename__ = "user_club_badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    club_badge_id = Column(UUID(as_uuid=True), ForeignKey("club_badges.id", ondelete="CASCADE"), nullable=False)
    earned_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "club_badge_id", name="uq_user_club_badge"),
    )

    user = relationship("User")
    club_badge = relationship("ClubBadge", back_populates="awards")


class ClubChallenge(Base):
    """Club-only monthly goal ('10,000km combined this month'). Progress
    is computed at read-time from members' ride logs in the date window
    (sum of distance_km) rather than stored/incremented - the numbers
    that feed it (ride logs) already exist and can change after the
    fact (edits, deletions), so a stored running total would drift."""

    __tablename__ = "club_challenges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    club_id = Column(UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    goal_km = Column(Float, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    # Badge every member gets awarded if the club collectively hits goal_km
    # by end_date - nullable so a challenge can exist without a prize yet.
    reward_club_badge_id = Column(UUID(as_uuid=True), ForeignKey("club_badges.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    club = relationship("Club", back_populates="challenges")
    reward_badge = relationship("ClubBadge")
