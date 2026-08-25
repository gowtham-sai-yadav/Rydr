"""p4 notifications table

Phase 4 W5 — the in-app notification feed.

Two indexes, serving the two queries the feature actually makes:

``idx_notifications_user_created`` covers the feed itself
(``WHERE user_id = ? ORDER BY created_at DESC``), with the sort direction
folded into the index so Postgres can stream rows out in order rather than
sorting them.

``idx_notifications_user_unread`` covers the bell badge
(``WHERE user_id = ? AND read_at IS NULL``) and is partial. Unread rows are a
small and roughly constant slice of a user's history, so a partial index stays
small forever while a full one would grow with every notification ever
delivered.

Revision ID: b2d5f8a1c3e7
Revises: a1c4e7b2d9f6
Create Date: 2026-08-28 00:10:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "b2d5f8a1c3e7"
down_revision: Union[str, None] = "a1c4e7b2d9f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.String(length=30), nullable=True),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_notifications_user_created",
        "notifications",
        ["user_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_notifications_user_unread",
        "notifications",
        ["user_id"],
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("idx_notifications_user_unread", table_name="notifications")
    op.drop_index("idx_notifications_user_created", table_name="notifications")
    op.drop_table("notifications")
