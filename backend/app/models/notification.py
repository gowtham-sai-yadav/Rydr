"""Notification — the in-app notification feed (Phase 4 W5).

One row per thing that happened *to* a user that they would want to know
about: someone asked to join their ride, a captain approved them, a badge
unlocked, a new message landed in a ride chat.

Design notes
------------
``type`` is a plain ``String(50)`` validated against the
:class:`NotificationType` Python enum rather than a Postgres enum. Every other
enum in this schema is a real PG type, so the departure is deliberate: the
notification vocabulary grows with almost every feature (Phase 4 alone adds
join, approval, waitlist, promotion, chat, badge, like, comment, follow and
moderation kinds), and a PG enum would mean an ``ALTER TYPE`` migration each
time. Nothing joins or sorts on ``type``, so the type-safety a PG enum buys is
not worth a migration per feature.

The target is stored as a loose ``(entity_type, entity_id)`` pair rather than a
real foreign key. A notification can point at a ride, a destination, a post, a
chat group or a badge, and modelling that as five nullable FKs would mean five
columns that are null 80% of the time plus a check constraint to keep them
mutually exclusive. The tradeoff accepted here is that the database will not
cascade-delete a notification when its target disappears; the read path
tolerates a dangling target and the client renders the notification without a
link.

``actor_id`` is the user who caused the notification, nullable because
system-generated notifications (a badge unlocking off a threshold) have no
actor. It is a real FK with ``SET NULL`` so a deleted account leaves the
notification readable rather than vanishing from someone's feed.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class NotificationType(str, enum.Enum):
    """Vocabulary of notification kinds.

    Values are persisted as strings. Adding a member needs no migration;
    removing one needs a data backfill, so prefer deprecating in code.
    """

    # Ride participation
    ride_join_requested = "ride_join_requested"
    ride_join_approved = "ride_join_approved"
    ride_join_rejected = "ride_join_rejected"
    ride_waitlisted = "ride_waitlisted"
    ride_waitlist_promoted = "ride_waitlist_promoted"
    ride_cancelled = "ride_cancelled"
    ride_starting = "ride_starting"
    ride_completed = "ride_completed"

    # Chat
    chat_message = "chat_message"

    # Gamification
    badge_earned = "badge_earned"

    # Social
    new_follower = "new_follower"
    post_liked = "post_liked"
    post_commented = "post_commented"
    destination_rated = "destination_rated"

    # Moderation
    report_resolved = "report_resolved"

    # Direct messages / private-account follow requests (M6). Kept distinct
    # from new_follower: that fires on an immediate (public-account) follow,
    # these cover the DM channel and the pending-request lifecycle a private
    # account needs.
    dm_received = "dm_received"
    follow_requested = "follow_requested"
    follow_accepted = "follow_accepted"


class EntityType(str, enum.Enum):
    """What a notification points at."""

    ride = "ride"
    chat_group = "chat_group"
    destination = "destination"
    post = "post"
    badge = "badge"
    user = "user"
    report = "report"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Recipient.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Who caused it. Null for system-generated notifications.
    actor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    type = Column(String(50), nullable=False)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=True)

    entity_type = Column(String(30), nullable=True)
    entity_id = Column(UUID(as_uuid=True), nullable=True)

    read_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # The feed query: WHERE user_id = ? ORDER BY created_at DESC.
        # created_at DESC is folded in so the sort comes from the index.
        Index(
            "idx_notifications_user_created",
            "user_id",
            created_at.desc(),
        ),
        # The bell badge: WHERE user_id = ? AND read_at IS NULL. Partial, so
        # the index only carries unread rows — it stays small no matter how
        # much read history accumulates, which is the common case by far.
        Index(
            "idx_notifications_user_unread",
            "user_id",
            postgresql_where=read_at.is_(None),
        ),
    )

    user = relationship(
        "User", foreign_keys=[user_id], back_populates="notifications"
    )
    actor = relationship("User", foreign_keys=[actor_id])
