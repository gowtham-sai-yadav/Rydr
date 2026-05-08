"""m6 follow indexes

Adds compound indexes on ``follows`` that the M1 migration omitted:

  idx_follows_followed_created  (followed_id, created_at DESC)
  idx_follows_follower_created  (follower_id, created_at DESC)

M1 created the table with only a composite PK on ``(follower_id, followed_id)``.
That PK is a usable index for ``WHERE follower_id = :id`` (PK leading column),
but for ``WHERE followed_id = :id`` — the "give me X's followers" query —
Postgres falls back to a sequential scan. Both M6 endpoints (followers list
+ following list) order by ``created_at DESC``, so folding ``created_at``
into each index also lets the planner skip the sort step.

``follows`` is empty in seed data, so backfill cost is zero.

Revision ID: a7b2c9d4e1f5
Revises: f1a2b3c4d5e6
Create Date: 2026-05-28 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a7b2c9d4e1f5"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_follows_followed_created",
        "follows",
        ["followed_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "idx_follows_follower_created",
        "follows",
        ["follower_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_follows_follower_created", table_name="follows")
    op.drop_index("idx_follows_followed_created", table_name="follows")
