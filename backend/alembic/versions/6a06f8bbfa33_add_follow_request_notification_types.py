"""add follow request notification types

Revision ID: 6a06f8bbfa33
Revises: 447062326768
Create Date: 2026-08-26 19:41:37.286611

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6a06f8bbfa33'
down_revision: Union[str, None] = '447062326768'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'follow_requested'")
    op.execute("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'follow_accepted'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums.
    pass
