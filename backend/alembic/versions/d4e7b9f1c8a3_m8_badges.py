"""m8 badge lookup indexes

Adds the two badge lookup indexes M8 needs.

The ``badges`` and ``user_badges`` tables themselves are created by the
M1 destination-schema revision (``b4e6c8f2a1d3``), not here — this
revision originally re-declared them, which made ``alembic upgrade head``
fail on a fresh database with "relation already exists". It now only adds
what M1 left out.

``badges`` is a fixed catalog (8 rows seeded by
``scripts/seed_badges.py``). ``user_badges`` records who has earned which
catalog entry and when. The ``uq_user_badge`` constraint (from M1) is what
lets ``services/badge_engine.evaluate_user_badges`` use
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


revision: str = "d4e7b9f1c8a3"
down_revision: Union[str, None] = "c3d8e6f4b9a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Both tables were introduced by the earlier M1 destination-schema
    # migration.  This revision only adds the lookup indexes that M1 omitted.
    inspector = sa.inspect(op.get_bind())
    existing_indexes = {
        index["name"] for index in inspector.get_indexes("user_badges")
    }

    if "idx_user_badges_user_id" not in existing_indexes:
        op.create_index(
            "idx_user_badges_user_id", "user_badges", ["user_id"]
        )
    if "idx_user_badges_badge_id" not in existing_indexes:
        op.create_index(
            "idx_user_badges_badge_id", "user_badges", ["badge_id"]
        )


def downgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    existing_indexes = {
        index["name"] for index in inspector.get_indexes("user_badges")
    }

    if "idx_user_badges_badge_id" in existing_indexes:
        op.drop_index("idx_user_badges_badge_id", table_name="user_badges")
    if "idx_user_badges_user_id" in existing_indexes:
        op.drop_index("idx_user_badges_user_id", table_name="user_badges")
