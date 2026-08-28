"""push tokens

Revision ID: 5c2085184165
Revises: 447062326768
Create Date: 2026-08-27 21:51:23.384164

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5c2085184165'
down_revision: Union[str, None] = '447062326768'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate also proposed dropping several indexes that predate
    # this migration and aren't declared in the current ORM models (drift
    # between DB and model __table_args__, unrelated to push tokens) -
    # left in place; only the new table is this migration's concern.
    op.create_table('push_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token', sa.String(length=255), nullable=False),
    sa.Column('platform', sa.String(length=20), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'token', name='uq_push_token_user_token')
    )


def downgrade() -> None:
    op.drop_table('push_tokens')
