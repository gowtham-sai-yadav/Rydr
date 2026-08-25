"""feed: posts, post_likes, post_comments

Phase 4 W4 social feed. A post either wraps a completed ride
(``ride_log_id`` set, so its photos surface via the existing
``ride_media`` table) or stands alone as a caption-only update.

Indexes on ``posts.created_at`` and the two FK id columns serve the feed
list query (newest first) and the per-post like/comment lookups.

Revision ID: b8c1f3e5a7d9
Revises: d4e7b9f1c8a3
Create Date: 2026-08-26 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "b8c1f3e5a7d9"
down_revision: Union[str, None] = "d4e7b9f1c8a3"
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
        sa.Column(
            "ride_log_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ride_logs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("caption", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_posts_created_at", "posts", [sa.text("created_at DESC")])
    op.create_index("idx_posts_author_id", "posts", ["author_id"])

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
    )
    op.create_index("idx_post_comments_post_id", "post_comments", ["post_id"])


def downgrade() -> None:
    op.drop_index("idx_post_comments_post_id", table_name="post_comments")
    op.drop_table("post_comments")
    op.drop_table("post_likes")
    op.drop_index("idx_posts_author_id", table_name="posts")
    op.drop_index("idx_posts_created_at", table_name="posts")
    op.drop_table("posts")
