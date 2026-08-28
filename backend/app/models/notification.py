"""Notification - in-app activity feed for ride/social events.

Rows are created as side effects of other routers (ride join requests,
approvals/rejections, post likes/comments, badge awards) rather than
through a dedicated create endpoint. The FK columns are all nullable
because a single notification only ever populates the subset relevant
to its ``type`` (e.g. ``post_liked`` sets ``post_id`` and ``actor_id``,
``badge_earned`` sets only ``badge_id``).
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class NotificationType(str, enum.Enum):
    ride_join_requested = "ride_join_requested"
    ride_join_approved = "ride_join_approved"
    ride_join_rejected = "ride_join_rejected"
    post_liked = "post_liked"
    post_commented = "post_commented"
    badge_earned = "badge_earned"
    dm_received = "dm_received"
    follow_requested = "follow_requested"
    follow_accepted = "follow_accepted"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    type = Column(
        SQLEnum(NotificationType, name="notification_type"),
        nullable=False,
    )
    actor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    ride_plan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_plans.id", ondelete="CASCADE"),
        nullable=True,
    )
    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=True,
    )
    badge_id = Column(
        UUID(as_uuid=True),
        ForeignKey("badges.id", ondelete="CASCADE"),
        nullable=True,
    )
    message = Column(String(500), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        # Serves "my notifications, newest first" and the unread-count query.
        Index("idx_notifications_user_created", "user_id", "created_at"),
    )

    user = relationship("User", foreign_keys=[user_id], back_populates="notifications")
    actor = relationship("User", foreign_keys=[actor_id])
    ride_plan = relationship("RidePlan")
    post = relationship("Post")
    badge = relationship("Badge")
