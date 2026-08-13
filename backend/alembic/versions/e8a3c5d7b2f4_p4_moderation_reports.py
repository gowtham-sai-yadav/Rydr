"""p4 moderation: reports table + users.is_admin

Phase 4 W7.

``users.is_admin`` is added with a server default of false so the column is
backfilled without a separate UPDATE and existing rows are non-admin, which is
the safe direction: a migration that accidentally granted admin to everyone
would be a security incident, one that grants it to nobody is an inconvenience
fixed by ``scripts/grant_admin.py``.

Revision ID: e8a3c5d7b2f4
Revises: d7f2b4e9a1c6
Create Date: 2026-08-28 00:40:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID


revision: str = "e8a3c5d7b2f4"
down_revision: Union[str, None] = "d7f2b4e9a1c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.create_table(
        "reports",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "reporter_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content_type", sa.String(length=20), nullable=False),
        sa.Column("content_id", UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column(
            "status", sa.String(length=20), nullable=False, server_default="open"
        ),
        sa.Column(
            "resolved_by_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "reporter_id",
            "content_type",
            "content_id",
            name="uq_report_reporter_content",
        ),
    )
    op.create_index(
        "idx_reports_status_created", "reports", ["status", "created_at"]
    )
    op.create_index(
        "idx_reports_content", "reports", ["content_type", "content_id"]
    )


def downgrade() -> None:
    op.drop_index("idx_reports_content", table_name="reports")
    op.drop_index("idx_reports_status_created", table_name="reports")
    op.drop_table("reports")
    op.drop_column("users", "is_admin")
