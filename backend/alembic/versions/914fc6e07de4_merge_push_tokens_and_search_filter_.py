"""merge push tokens and search filter indexes

Revision ID: 914fc6e07de4
Revises: 5c2085184165, f4b8d1e6c9a3
Create Date: 2026-08-28 20:02:22.384705

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '914fc6e07de4'
down_revision: Union[str, None] = ('5c2085184165', 'f4b8d1e6c9a3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
