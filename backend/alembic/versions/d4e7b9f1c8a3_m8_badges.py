"""m8 badges + user_badges

Creates the badge catalog and the user-award table for M8.

The ``badges`` table is a fixed catalog (8 rows seeded by
``scripts/seed_badges.py``). The ``user_badges`` table records who has
earned which catalog entry and when. The ``uq_user_badge`` constraint is
what lets ``services/badge_engine.evaluate_user_badges`` use
``ON CONFLICT DO NOTHING`` — the engine is safe to re-run without
producing duplicates.

Indexes on ``user_id`` and ``badge_id`` serve the two read paths:
profile shelf (``WHERE user_id = ?``) and "how many people earned X"
(``WHERE badge_id = ?`` — not surfaced in Phase 3 but cheap to add now).

Revision ID: d4e7b9f1c8a3
Revises: c3d8e6f4b9a2
Create Date: 2026-05-28 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "d4e7b9f1c8a3"
down_revision: Union[str, None] = "c3d8e6f4b9a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "badges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("icon_url", sa.String(length=500), nullable=True),
        sa.UniqueConstraint("slug", name="uq_badges_slug"),
    )

    op.create_table(
        "user_badges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "badge_id",
            UUID(as_uuid=True),
            sa.ForeignKey("badges.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "earned_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),
    )
    op.create_index(
        "idx_user_badges_user_id", "user_badges", ["user_id"]
    )
    op.create_index(
        "idx_user_badges_badge_id", "user_badges", ["badge_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_user_badges_badge_id", table_name="user_badges")
    op.drop_index("idx_user_badges_user_id", table_name="user_badges")
    op.drop_table("user_badges")
    op.drop_table("badges")
