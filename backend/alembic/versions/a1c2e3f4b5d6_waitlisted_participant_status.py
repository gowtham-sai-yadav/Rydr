"""add waitlisted to participant_status enum

Ride-capacity hardening (Phase 4): a join request made while the ride is
already at capacity now lands in a new ``waitlisted`` state instead of
``pending``, so the captain's approval queue only shows requests that are
actually actionable today.

``ALTER TYPE ... ADD VALUE`` cannot run inside the same transaction as
other statements pre-PG12, and even on PG12+ it cannot run in the same
transaction that later reads the new value. Alembic wraps each migration
in a transaction by default, so this uses ``autocommit_block()`` to run
the ALTER TYPE as its own implicit transaction, matching the documented
Alembic pattern for enum additions.

Revision ID: a1c2e3f4b5d6
Revises: d4e7b9f1c8a3
Create Date: 2026-08-26 00:00:00
"""
from typing import Sequence, Union

from alembic import op


revision: str = "a1c2e3f4b5d6"
down_revision: Union[str, None] = "d4e7b9f1c8a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE participant_status ADD VALUE IF NOT EXISTS 'waitlisted'")


def downgrade() -> None:
    # Postgres has no ``DROP VALUE`` for enums. Downgrading would require
    # rebuilding the type (create new type, cast the column, drop the old
    # type) - out of scope here since no migration in this chain has ever
    # needed to actually roll an enum value back. Left as a no-op; any
    # existing 'waitlisted' rows would need to be reassigned before a
    # real downgrade could drop the value.
    pass
