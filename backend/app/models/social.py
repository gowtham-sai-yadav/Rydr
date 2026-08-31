"""Follow + Discussion + DiscussionComment — engagement primitives.

All wired in M1 at the schema level. Endpoint wiring lands in M6 (follow) and M7 (discussions).
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class FollowStatus(str, enum.Enum):
    # Public target (the default): a follow lands as accepted immediately.
    accepted = "accepted"
    # Private target: sits here until the target accepts/rejects it. A
    # pending row does NOT count toward followers_count/is_followed_by_me/
    # DM eligibility - those all filter on status == accepted.
    pending = "pending"


class Follow(Base):
    __tablename__ = "follows"

    follower_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    followed_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status = Column(
        SQLEnum(FollowStatus, name="follow_status"),
        nullable=False,
        default=FollowStatus.accepted,
        server_default=FollowStatus.accepted.value,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("follower_id != followed_id", name="ck_follow_not_self"),
        # Added in M6 (audit: M1 left the table with only the composite PK,
        # which doesn't help WHERE followed_id = :id lookups). Each index
        # folds ``created_at DESC`` so the "newest first" sort served by
        # ``_paginated_follow_list`` comes free.
        #
        # M6 audit #1 follow-up: the direction (DESC) must match the
        # corresponding Alembic migration verbatim. ``text("created_at DESC")``
        # is the portable way to express ordered-column index entries that
        # mirrors ``sa.text(...)`` in the migration — using a bare
        # ``"created_at"`` defaults to ASC, which produces an
        # ``alembic --autogenerate`` diff on every run.
        Index(
            "idx_follows_followed_created",
            "followed_id",
            text("created_at DESC"),
            postgresql_using="btree",
        ),
        Index(
            "idx_follows_follower_created",
            "follower_id",
            text("created_at DESC"),
            postgresql_using="btree",
        ),
    )

    follower = relationship(
        "User", foreign_keys=[follower_id], back_populates="following"
    )
    followed = relationship(
        "User", foreign_keys=[followed_id], back_populates="followers"
    )


class Discussion(Base):
    __tablename__ = "discussions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    destination = relationship("Destination", back_populates="discussions")
    author = relationship("User", back_populates="discussions")
    comments = relationship(
        "DiscussionComment",
        back_populates="discussion",
        cascade="all, delete-orphan",
        order_by="DiscussionComment.created_at",
    )


class DiscussionComment(Base):
    __tablename__ = "discussion_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    discussion_id = Column(
        UUID(as_uuid=True),
        ForeignKey("discussions.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Nullable self-FK. One-level nesting enforced in service code — M7.
    parent_comment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("discussion_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    discussion = relationship("Discussion", back_populates="comments")
    author = relationship("User", back_populates="discussion_comments")
    parent = relationship(
        "DiscussionComment", remote_side=[id], back_populates="replies"
    )
    replies = relationship(
        "DiscussionComment", back_populates="parent", cascade="all, delete-orphan"
    )
