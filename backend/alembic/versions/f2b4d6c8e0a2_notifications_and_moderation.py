"""notifications + moderation reports + users.is_admin

Phase 4: adds the in-app notification feed (``notifications``), the
abuse-report queue (``reports``), and the ``is_admin`` flag on ``users``
that gates the moderation endpoints.

Revision ID: f2b4d6c8e0a2
Revises: a1c2e3f4b5d6
Create Date: 2026-08-26 00:00:01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "f2b4d6c8e0a2"
down_revision: Union[str, None] = "a1c2e3f4b5d6"
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
        "notifications",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "type",
            sa.Enum(
                "ride_join_requested",
                "ride_join_approved",
                "ride_join_rejected",
                "post_liked",
                "post_commented",
                "badge_earned",
                name="notification_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "actor_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "ride_plan_id",
            UUID(as_uuid=True),
            sa.ForeignKey("ride_plans.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "post_id",
            UUID(as_uuid=True),
            sa.ForeignKey("posts.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "badge_id",
            UUID(as_uuid=True),
            sa.ForeignKey("badges.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "idx_notifications_user_created", "notifications", ["user_id", "created_at"]
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
        sa.Column(
            "target_type",
            sa.Enum(
                "post", "comment", "rating", "chat_message", "user",
                name="report_target_type",
            ),
            nullable=False,
        ),
        sa.Column("target_id", UUID(as_uuid=True), nullable=False),
        sa.Column("reason", sa.String(length=1000), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "open", "reviewed", "dismissed", "actioned", name="report_status"
            ),
            nullable=False,
            server_default="open",
        ),
        sa.Column(
            "reviewed_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("idx_reports_status", "reports", ["status"])


def downgrade() -> None:
    op.drop_index("idx_reports_status", table_name="reports")
    op.drop_table("reports")
    op.execute("DROP TYPE IF EXISTS report_status")
    op.execute("DROP TYPE IF EXISTS report_target_type")

    op.drop_index("idx_notifications_user_created", table_name="notifications")
    op.drop_table("notifications")
    op.execute("DROP TYPE IF EXISTS notification_type")

    op.drop_column("users", "is_admin")
