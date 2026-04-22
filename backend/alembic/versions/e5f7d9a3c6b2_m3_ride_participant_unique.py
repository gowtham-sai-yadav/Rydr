"""m3 ride participant unique constraint + timestamps

Adds the (ride_plan_id, user_id) unique constraint on ride_plan_participants
so the M3 join endpoint can safely use ON CONFLICT DO UPDATE under concurrent
double-submits, and adds created_at / updated_at so the participants list can
sort by chronological join order (UUID v4 ids are random).

Both columns are NOT NULL with server_default=NOW(); ride_plan_participants is
empty in seed data so the backfill is trivial.

Revision ID: e5f7d9a3c6b2
Revises: b4e6c8f2a1d3
Create Date: 2026-05-24 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e5f7d9a3c6b2"
down_revision: Union[str, None] = "b4e6c8f2a1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ride_plan_participants",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.add_column(
        "ride_plan_participants",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_unique_constraint(
        "uq_participant_ride_user",
        "ride_plan_participants",
        ["ride_plan_id", "user_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_participant_ride_user", "ride_plan_participants", type_="unique"
    )
    op.drop_column("ride_plan_participants", "updated_at")
    op.drop_column("ride_plan_participants", "created_at")
