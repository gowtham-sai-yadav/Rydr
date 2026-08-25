"""Post + PostLike + PostComment — the community feed.

A post is a rider sharing a completed ride (optionally linked to a
``RideLog`` so its photos surface automatically) or a standalone update.
"""
from __future__ import annotations

import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    caption = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    author = relationship("User", back_populates="posts")
    ride_log = relationship("RideLog", back_populates="posts")
    likes = relationship(
        "PostLike", back_populates="post", cascade="all, delete-orphan"
    )
    comments = relationship(
        "PostComment",
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostComment.created_at",
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    post = relationship("Post", back_populates="likes")
    user = relationship("User", back_populates="post_likes")


class PostComment(Base):
    __tablename__ = "post_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    post = relationship("Post", back_populates="comments")
    author = relationship("User", back_populates="post_comments")
