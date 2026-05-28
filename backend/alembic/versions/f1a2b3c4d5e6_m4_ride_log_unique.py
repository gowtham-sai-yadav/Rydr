"""m4 ride_log one-per-rider unique constraint

Adds ``UniqueConstraint(ride_plan_id, rider_id)`` on ``ride_logs`` so M4's
log-create endpoint can safely use ``ON CONFLICT DO UPDATE`` under concurrent
double-submits (matching the M2 rating + M3 participant patterns).

``ride_logs`` is empty in seed data so backfill is trivial.

Revision ID: f1a2b3c4d5e6
Revises: e5f7d9a3c6b2
Create Date: 2026-05-24 00:00:00
"""
from typing import Sequence, Union

from alembic import op


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e5f7d9a3c6b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_ride_log_ride_rider",
        "ride_logs",
        ["ride_plan_id", "rider_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_ride_log_ride_rider", "ride_logs", type_="unique")
