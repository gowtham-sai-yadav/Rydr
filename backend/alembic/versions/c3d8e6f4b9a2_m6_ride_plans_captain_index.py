"""m6 ride_plans captain index

Adds a compound index on ``ride_plans (captain_id, planned_date DESC)``.

M6 audit #4: no index existed on ``ride_plans.captain_id`` — Postgres
doesn't auto-index FK columns. Two query paths hit ``captain_id =`` or
``captain_id IN (...)``:

  - ``GET /api/rides/mine`` (M3) — filters captained rides
  - ``GET /api/rides/feed?following_only=true`` (M6) — `captain_id IN (
    SELECT followed_id FROM follows WHERE follower_id = :me)`

Both stack with ``planned_date >= today``, so folding ``planned_date DESC``
into the index lets the planner serve both filter + sort from one scan.

``ride_plans`` is small in seed data so backfill is instant.

Revision ID: c3d8e6f4b9a2
Revises: a7b2c9d4e1f5
Create Date: 2026-05-28 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c3d8e6f4b9a2"
down_revision: Union[str, None] = "a7b2c9d4e1f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "idx_ride_plans_captain_planned_date",
        "ride_plans",
        ["captain_id", sa.text("planned_date DESC")],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_ride_plans_captain_planned_date", table_name="ride_plans"
    )
