"""add dm_received notification type

Revision ID: 2b8f5eeb4c1b
Revises: d3ca57bde9d5
Create Date: 2026-08-26 19:08:02.077842

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b8f5eeb4c1b'
down_revision: Union[str, None] = 'd3ca57bde9d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres allows ADD VALUE inside a transaction since PG12; the new
    # value just can't be used in the *same* transaction it was added in,
    # which doesn't apply here since nothing else in this migration touches it.
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'dm_received'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums; downgrading a value out would
    # require rebuilding the type, which isn't worth it for one enum member.
    pass
