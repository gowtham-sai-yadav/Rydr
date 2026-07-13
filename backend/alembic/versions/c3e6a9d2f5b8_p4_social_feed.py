"""p4 social feed: posts, media, likes, comments

Phase 4 W4 — the community feed.

Indexes match the three queries the feed makes: the global timeline
(created_at DESC), a single author's timeline and the following-feed's
author_id IN (...) path (author_id, created_at DESC), and "which of these
posts have I liked" (post_likes.user_id, mirroring the composite PK which is
post-first and so cannot serve a user-first lookup).

Revision ID: c3e6a9d2f5b8
Revises: b2d5f8a1c3e7
Create Date: 2026-08-28 00:20:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "c3e6a9d2f5b8"
down_revision: Union[str, None] = "b2d5f8a1c3e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "posts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "author_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "ride_log_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ride_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "destination_id",
            UUID(as_uuid=True),
            sa.ForeignKey("destinations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_posts_created", "posts", [sa.text("created_at DESC")])
    op.create_index(
        "idx_posts_author_created",
        "posts",
        ["author_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "post_media",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column(
            "media_type",
            sa.String(length=10),
            nullable=False,
            server_default="image",
        ),
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_post_media_post", "post_media", ["post_id"])

    op.create_table(
        "post_likes",
        sa.Column(
            "post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_post_likes_user", "post_likes", ["user_id"])

    op.create_table(
        "post_comments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "author_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_post_comments_post_created", "post_comments", ["post_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("idx_post_comments_post_created", table_name="post_comments")
    op.drop_table("post_comments")
    op.drop_index("idx_post_likes_user", table_name="post_likes")
    op.drop_table("post_likes")
    op.drop_index("idx_post_media_post", table_name="post_media")
    op.drop_table("post_media")
    op.drop_index("idx_posts_author_created", table_name="posts")
    op.drop_index("idx_posts_created", table_name="posts")
    op.drop_table("posts")
