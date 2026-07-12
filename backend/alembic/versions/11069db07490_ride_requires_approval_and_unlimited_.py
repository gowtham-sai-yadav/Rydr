"""ride requires_approval and unlimited max_riders

Revision ID: 11069db07490
Revises: f2b4d6c8e0a2
Create Date: 2026-08-26 18:58:23.573105

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11069db07490'
down_revision: Union[str, None] = 'f2b4d6c8e0a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ride_plans",
        sa.Column(
            "requires_approval",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
    op.alter_column("ride_plans", "max_riders", nullable=True)


def downgrade() -> None:
    # Backfill any NULL (unlimited) rides to a default cap before requiring
    # NOT NULL again, so the downgrade doesn't fail on real "no limit" data.
    op.execute("UPDATE ride_plans SET max_riders = 50 WHERE max_riders IS NULL")
    op.alter_column("ride_plans", "max_riders", nullable=False)
    op.drop_column("ride_plans", "requires_approval")
