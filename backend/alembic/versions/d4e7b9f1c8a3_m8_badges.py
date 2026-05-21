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

from alembic import op


revision: str = "d4e7b9f1c8a3"
down_revision: Union[str, None] = "c3d8e6f4b9a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # "badges" and "user_badges" were already created as forward-looking
    # stubs in the M1 destination-schema migration (b4e6c8f2a1d3) — creating
    # either again here fails on a fresh database. Only the two read-path
    # indexes are new.
    op.create_index(
        "idx_user_badges_user_id", "user_badges", ["user_id"]
    )
    op.create_index(
        "idx_user_badges_badge_id", "user_badges", ["badge_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_user_badges_badge_id", table_name="user_badges")
    op.drop_index("idx_user_badges_user_id", table_name="user_badges")
