"""Report — user-filed moderation reports against any content type.

``target_type`` + ``target_id`` is a loose polymorphic reference (no FK —
the target tables don't share a common parent) mirroring how ``Notification``
handles multiple optional target kinds, except here only one type applies
per row so a plain enum + UUID pair is enough.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class ReportTargetType(str, enum.Enum):
    post = "post"
    comment = "comment"
    rating = "rating"
    chat_message = "chat_message"
    user = "user"


class ReportStatus(str, enum.Enum):
    open = "open"
    reviewed = "reviewed"
    dismissed = "dismissed"
    actioned = "actioned"


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    reporter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_type = Column(
        SQLEnum(ReportTargetType, name="report_target_type"),
        nullable=False,
    )
    target_id = Column(UUID(as_uuid=True), nullable=False)
    reason = Column(String(1000), nullable=False)
    status = Column(
        SQLEnum(ReportStatus, name="report_status"),
        nullable=False,
        default=ReportStatus.open,
    )
    reviewed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    reporter = relationship("User", foreign_keys=[reporter_id])
    reviewer = relationship("User", foreign_keys=[reviewed_by])
