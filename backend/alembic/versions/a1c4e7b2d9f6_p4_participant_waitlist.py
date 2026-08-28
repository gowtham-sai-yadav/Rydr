"""p4 participant waitlist status

Adds ``waitlisted`` to the ``participant_status`` enum.

Phase 4 W6 makes ``RidePlan.max_riders`` binding. When a captain approves a
rider into a ride that is already at capacity, the rider is queued as
``waitlisted`` rather than silently overfilling the ride, and is promoted to
``approved`` automatically when a seat frees.

``ALTER TYPE ... ADD VALUE`` is permitted inside a transaction block from
Postgres 12 onward, provided the new label is not *used* in the same
transaction. This revision only adds the label; the first rows carrying it are
written by application code long after the migration commits.

The label cannot be removed again — Postgres has no ``ALTER TYPE ... DROP
VALUE``. downgrade() therefore reverts the data (waitlisted rows become
``pending``, which is the closest pre-Phase-4 meaning: awaiting a captain
decision) and leaves the now-unused label in the type. This is recorded rather
than worked around because the alternative — recreating the type and rewriting
every dependent column — is far more dangerous than an orphan enum label.

Revision ID: a1c4e7b2d9f6
Revises: d4e7b9f1c8a3
Create Date: 2026-08-28 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1c4e7b2d9f6"
down_revision: Union[str, None] = "d4e7b9f1c8a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TYPE participant_status ADD VALUE IF NOT EXISTS 'waitlisted'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE ride_plan_participants "
        "SET status = 'pending' WHERE status = 'waitlisted'"
    )
