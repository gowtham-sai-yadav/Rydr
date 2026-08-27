"""Feed posts, likes and comments — Phase 4 W4.

The community feed described in the Phase 4 plan §1.3: "ride recaps and
photos" with "likes and comments on posts".

Relationship to the existing Discussion model
---------------------------------------------
``models/social.Discussion`` already exists and is superficially similar. It
is a different thing and stays: a Discussion is a titled thread anchored to a
Destination ("Best time to ride to Nandi Hills?"), with threaded replies —
reference material attached to a place. A Post is an untitled, chronological
entry on a person's timeline, optionally attached to a ride they logged.
Forcing both through one table would mean a nullable title, a nullable
destination, a nullable ride log, and a discriminator column, which is a
worse model than two honest ones.

Counter strategy
----------------
``like_count`` and ``comment_count`` are NOT stored on the post. They are
computed per request by a batched aggregate over the whole page of posts —
one extra query for the page, not one per post. Denormalised counters would
need to be kept correct under concurrent likes, and the read volume here does
not justify that: the feed is paginated to at most 50 posts, so the aggregate
is bounded and indexed. If the feed ever needs to sort by popularity rather
than recency this decision should be revisited, because sorting cannot use a
computed-after-the-fact count.
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
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PostMediaType(str, enum.Enum):
    image = "image"
    video = "video"


class Post(Base):
    __tablename__ = "posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    author_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    body = Column(Text, nullable=False)

    # Optional anchors. A post can be a plain status update (both null), a
    # ride recap (ride_log_id set), or a note about a place (destination_id
    # set). SET NULL rather than CASCADE on both: deleting a ride log should
    # not silently delete the rider's write-up of it.
    ride_log_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ride_logs.id", ondelete="SET NULL"),
        nullable=True,
    )
    destination_id = Column(
        UUID(as_uuid=True),
        ForeignKey("destinations.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        # The global feed: ORDER BY created_at DESC.
        Index("idx_posts_created", text("created_at DESC")),
        # A user's own timeline, and the following-feed's
        # ``author_id IN (subquery)`` path.
        Index("idx_posts_author_created", "author_id", text("created_at DESC")),
    )

    author = relationship("User", back_populates="posts")
    ride_log = relationship("RideLog")
    destination = relationship("Destination")
    media = relationship(
        "PostMedia", back_populates="post", cascade="all, delete-orphan"
    )
    likes = relationship(
        "PostLike", back_populates="post", cascade="all, delete-orphan"
    )
    comments = relationship(
        "PostComment",
        back_populates="post",
        cascade="all, delete-orphan",
        order_by="PostComment.created_at",
    )


class PostMedia(Base):
    __tablename__ = "post_media"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(
        UUID(as_uuid=True),
        ForeignKey("posts.id", ondelete="CASCADE"),
        nullable=False,
    )
    url = Column(String(500), nullable=False)
    media_type = Column(String(10), nullable=False, default=PostMediaType.image.value)
    thumbnail_url = Column(String(500), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("idx_post_media_post", "post_id"),)

    post = relationship("Post", back_populates="media")


class PostLike(Base):
    __tablename__ = "post_likes"

    # Composite PK rather than a surrogate id: the pair *is* the identity, and
    # it gives the uniqueness that makes the like endpoint safely idempotent
    # via ON CONFLICT DO NOTHING.
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
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        # "Which of these posts have I liked?" for a whole page in one query.
        # The composite PK is (post_id, user_id), which does not serve a
        # user-first lookup, so this is the mirror index.
        Index("idx_post_likes_user", "user_id"),
    )

    post = relationship("Post", back_populates="likes")
    user = relationship("User")


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
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        # Comments for one post, oldest first — the natural reading order.
        Index("idx_post_comments_post_created", "post_id", "created_at"),
    )

    post = relationship("Post", back_populates="comments")
    author = relationship("User")


# Flat comments, deliberately. DiscussionComment supports one level of
# nesting because a destination thread is reference material people argue in;
# a feed comment is a reaction, and every product that has added nesting to a
# feed has then had to add collapsing to hide it.
