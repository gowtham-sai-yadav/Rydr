"""Content reports — Phase 4 W7 moderation.

The plan asks for "basic content moderation / admin reporting tools". This is
the report queue: any authenticated rider can flag a piece of content, and an
admin works the queue.

Polymorphic target
------------------
Reports point at posts, comments, destinations, ride plans, chat messages and
users, so the target is a ``(content_type, content_id)`` pair rather than six
nullable foreign keys — the same tradeoff, for the same reason, as
``Notification``. The consequence is the same too: deleting reported content
does not cascade the report away. Here that is a feature rather than a cost,
because the moderation record should outlive the content it was about. An
admin needs to see that a post was reported and removed, and a report row that
vanished along with the post would erase the audit trail.

Status lifecycle
----------------
``open -> reviewing -> actioned | dismissed``. Terminal states record who
resolved it and when, so "who removed this and why" is answerable later.
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
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ReportedContentType(str, enum.Enum):
    post = "post"
    post_comment = "post_comment"
    destination = "destination"
    ride_plan = "ride_plan"
    chat_message = "chat_message"
    user = "user"


class ReportReason(str, enum.Enum):
    spam = "spam"
    harassment = "harassment"
    misinformation = "misinformation"
    unsafe = "unsafe"
    inappropriate = "inappropriate"
    other = "other"


class ReportStatus(str, enum.Enum):
    open = "open"
    reviewing = "reviewing"
    actioned = "actioned"
    dismissed = "dismissed"


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    reporter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    content_type = Column(String(20), nullable=False)
    content_id = Column(UUID(as_uuid=True), nullable=False)

    reason = Column(String(20), nullable=False)
    details = Column(Text, nullable=True)

    status = Column(String(20), nullable=False, default=ReportStatus.open.value)

    # SET NULL rather than CASCADE: an admin leaving the project must not
    # delete the record of decisions they made.
    resolved_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolution_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # One report per person per piece of content. Without this, a single
        # user could inflate a report count by submitting repeatedly, and the
        # admin queue would fill with duplicates of the same complaint. Users
        # who want to add information amend their existing report.
        UniqueConstraint(
            "reporter_id",
            "content_type",
            "content_id",
            name="uq_report_reporter_content",
        ),
        # The admin queue: WHERE status = 'open' ORDER BY created_at.
        Index("idx_reports_status_created", "status", "created_at"),
        # "How many people reported this thing?" — the signal that separates
        # one annoyed rider from a genuine problem.
        Index("idx_reports_content", "content_type", "content_id"),
    )

    reporter = relationship("User", foreign_keys=[reporter_id])
    resolver = relationship("User", foreign_keys=[resolved_by_id])
