"""private accounts and follow requests

Revision ID: 447062326768
Revises: a7970339e50c
Create Date: 2026-08-26 19:40:01.160741

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '447062326768'
down_revision: Union[str, None] = 'a7970339e50c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    follow_status = postgresql.ENUM('accepted', 'pending', name='follow_status')
    follow_status.create(op.get_bind())

    op.add_column(
        'follows',
        sa.Column(
            'status',
            postgresql.ENUM('accepted', 'pending', name='follow_status', create_type=False),
            server_default='accepted',
            nullable=False,
        ),
    )
    # Note: autogenerate also proposed dropping several indexes on
    # post_comments/posts/reports/user_badges - pre-existing drift
    # unrelated to this migration (same call made in d3ca57bde9d5,
    # a7970339e50c).
    op.add_column('users', sa.Column('is_private', sa.Boolean(), server_default='false', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'is_private')
    op.drop_column('follows', 'status')
    postgresql.ENUM(name='follow_status').drop(op.get_bind())
