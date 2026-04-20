"""m1 destination schema

Rewrites the PoC schema around Destination as the primary entity.
Drops the old `rides`, `ride_stops`, `ride_participants`, `chat_groups`, `bikes`,
and `users` tables (including their enum types) and creates the new schema.

Revision ID: b4e6c8f2a1d3
Revises: 3c0a0b736b45
Create Date: 2026-04-19 00:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b4e6c8f2a1d3"
down_revision: Union[str, None] = "3c0a0b736b45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# New enum types — declared once, created explicitly, referenced with
# create_type=False in column definitions so SQLAlchemy doesn't try to
# re-create them per column.
# ---------------------------------------------------------------------------
BIKE_TYPE = postgresql.ENUM(
    "commuter", "sport", "adventure", "cruiser", "any", name="bike_type"
)
TAG_CATEGORY = postgresql.ENUM("vibe", "vehicle_fit", name="tag_category")
TERRAIN_DIFFICULTY = postgresql.ENUM(
    "chill", "moderate", "rough", name="terrain_difficulty"
)
RIDE_PLAN_VISIBILITY = postgresql.ENUM(
    "solo", "group", name="ride_plan_visibility"
)
RIDE_PLAN_STATUS = postgresql.ENUM(
    "planned", "in_progress", "completed", "cancelled", name="ride_plan_status"
)
DIFFICULTY_LEVEL = postgresql.ENUM(
    "easy", "moderate", "hard", "expert", name="difficulty_level"
)
PARTICIPANT_STATUS = postgresql.ENUM(
    "pending", "approved", "rejected", "left", name="participant_status"
)
ROAD_CONDITION = postgresql.ENUM("good", "ok", "rough", "bad", name="road_condition")
MEDIA_TYPE = postgresql.ENUM("image", "video", name="media_type")


NEW_ENUMS = [
    BIKE_TYPE,
    TAG_CATEGORY,
    TERRAIN_DIFFICULTY,
    RIDE_PLAN_VISIBILITY,
    RIDE_PLAN_STATUS,
    DIFFICULTY_LEVEL,
    PARTICIPANT_STATUS,
    ROAD_CONDITION,
    MEDIA_TYPE,
]

# Enum type names dropped from the PoC's initial migration.
OLD_ENUM_TYPE_NAMES = ["ridestatus", "difficultylevel", "participantstatus"]


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------------------------
    # 1. Drop old tables in reverse FK order
    # ------------------------------------------------------------------
    op.drop_table("ride_stops")
    op.drop_table("ride_participants")
    op.drop_table("chat_groups")
    op.drop_table("rides")
    op.drop_table("bikes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    # ------------------------------------------------------------------
    # 2. Drop old enum types (safe: IF EXISTS)
    # ------------------------------------------------------------------
    for name in OLD_ENUM_TYPE_NAMES:
        op.execute(f"DROP TYPE IF EXISTS {name}")

    # ------------------------------------------------------------------
    # 3. Create new enum types
    # ------------------------------------------------------------------
    for enum_type in NEW_ENUMS:
        enum_type.create(bind, checkfirst=True)

    # ------------------------------------------------------------------
    # 4. Create tables in FK-safe order
    # ------------------------------------------------------------------

    # users — no FK dependencies beyond self
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("home_city", sa.String(length=100), nullable=True),
        sa.Column("home_latitude", sa.Float(), nullable=True),
        sa.Column("home_longitude", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # bikes — FK to users
    op.create_table(
        "bikes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("engine_cc", sa.Integer(), nullable=True),
        sa.Column("mileage_kmpl", sa.Float(), nullable=True),
        sa.Column(
            "type",
            postgresql.ENUM(
                "commuter", "sport", "adventure", "cruiser", "any",
                name="bike_type", create_type=False,
            ),
            nullable=False,
            server_default="any",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )

    # tags — standalone
    op.create_table(
        "tags",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column(
            "category",
            postgresql.ENUM("vibe", "vehicle_fit", name="tag_category", create_type=False),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    # badges — standalone catalog
    op.create_table(
        "badges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("icon_url", sa.String(length=500), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )

    # destinations — FK to users (submitter)
    op.create_table(
        "destinations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("region", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="India"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column(
            "terrain_difficulty",
            postgresql.ENUM("chill", "moderate", "rough", name="terrain_difficulty", create_type=False),
            nullable=False,
            server_default="moderate",
        ),
        sa.Column("estimated_food_cost", sa.Integer(), nullable=True),
        sa.Column("estimated_entry_cost", sa.Integer(), nullable=True),
        sa.Column("best_season", sa.String(length=100), nullable=True),
        sa.Column("best_time_of_day", sa.String(length=50), nullable=True),
        sa.Column("hero_media_url", sa.String(length=500), nullable=True),
        sa.Column("avg_rating", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("submitted_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_destinations_region", "destinations", ["region"])
    op.create_index("idx_destinations_latlng", "destinations", ["latitude", "longitude"])

    # destination_tags — M2M
    op.create_table(
        "destination_tags",
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("destination_id", "tag_id"),
    )

    # routes — FK to destinations + users
    op.create_table(
        "routes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # route_points — FK to routes
    op.create_table(
        "route_points",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("route_id", sa.UUID(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("is_stop", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.ForeignKeyConstraint(["route_id"], ["routes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_route_points_route_order", "route_points", ["route_id", "ordinal"])

    # ride_plans — FK to destinations + routes + users
    op.create_table(
        "ride_plans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("route_id", sa.UUID(), nullable=True),
        sa.Column("captain_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
        sa.Column("planned_date", sa.Date(), nullable=False),
        sa.Column("planned_start_time", sa.Time(), nullable=False),
        sa.Column("estimated_end_time", sa.Time(), nullable=True),
        sa.Column(
            "visibility",
            postgresql.ENUM("solo", "group", name="ride_plan_visibility", create_type=False),
            nullable=False,
            server_default="group",
        ),
        sa.Column(
            "difficulty_level",
            postgresql.ENUM(
                "easy", "moderate", "hard", "expert",
                name="difficulty_level", create_type=False,
            ),
            nullable=False,
            server_default="moderate",
        ),
        sa.Column("recommended_bike_type", sa.String(length=100), nullable=True),
        sa.Column("break_schedule", sa.Text(), nullable=True),
        sa.Column("max_riders", sa.Integer(), nullable=False, server_default="10"),
        sa.Column(
            "status",
            postgresql.ENUM(
                "planned", "in_progress", "completed", "cancelled",
                name="ride_plan_status", create_type=False,
            ),
            nullable=False,
            server_default="planned",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["route_id"], ["routes.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["captain_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ride_plan_participants
    op.create_table(
        "ride_plan_participants",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ride_plan_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            postgresql.ENUM(
                "pending", "approved", "rejected", "left",
                name="participant_status", create_type=False,
            ),
            nullable=False,
            server_default="pending",
        ),
        sa.ForeignKeyConstraint(["ride_plan_id"], ["ride_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ride_logs — FK to ride_plans + users
    op.create_table(
        "ride_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ride_plan_id", sa.UUID(), nullable=False),
        sa.Column("rider_id", sa.UUID(), nullable=False),
        sa.Column("actual_start_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_end_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_cost", sa.Integer(), nullable=True),
        sa.Column(
            "road_condition",
            postgresql.ENUM("good", "ok", "rough", "bad", name="road_condition", create_type=False),
            nullable=True,
        ),
        sa.Column("recommended", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["ride_plan_id"], ["ride_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["rider_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ride_media — FK to ride_logs + users
    op.create_table(
        "ride_media",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ride_log_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column(
            "media_type",
            postgresql.ENUM("image", "video", name="media_type", create_type=False),
            nullable=False,
            server_default="image",
        ),
        sa.Column("uploaded_by_user_id", sa.UUID(), nullable=True),
        sa.Column("caption", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["ride_log_id"], ["ride_logs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # destination_media — FK to destinations + users + ride_logs
    op.create_table(
        "destination_media",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("caption", sa.String(length=500), nullable=True),
        sa.Column("uploaded_by_user_id", sa.UUID(), nullable=True),
        sa.Column("ride_log_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["uploaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ride_log_id"], ["ride_logs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # ratings
    op.create_table(
        "ratings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("review", sa.Text(), nullable=True),
        sa.Column("ride_log_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("stars >= 1 AND stars <= 5", name="ck_rating_stars_range"),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ride_log_id"], ["ride_logs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("destination_id", "user_id", name="uq_rating_destination_user"),
    )

    # follows
    op.create_table(
        "follows",
        sa.Column("follower_id", sa.UUID(), nullable=False),
        sa.Column("followed_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("follower_id != followed_id", name="ck_follow_not_self"),
        sa.ForeignKeyConstraint(["follower_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["followed_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("follower_id", "followed_id"),
    )

    # discussions
    op.create_table(
        "discussions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("destination_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["destination_id"], ["destinations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # discussion_comments (self-FK for 1-level nesting)
    op.create_table(
        "discussion_comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("discussion_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("parent_comment_id", sa.UUID(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["discussion_id"], ["discussions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_comment_id"], ["discussion_comments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # user_badges
    op.create_table(
        "user_badges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("badge_id", sa.UUID(), nullable=False),
        sa.Column("earned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["badge_id"], ["badges.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "badge_id", name="uq_user_badge"),
    )

    # chat_groups — FK renamed to ride_plan_id
    op.create_table(
        "chat_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ride_plan_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(["ride_plan_id"], ["ride_plans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ride_plan_id"),
    )

    # chat_messages — new in M1, wired into endpoints in M5
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("chat_group_id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["chat_group_id"], ["chat_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_chat_messages_group_time", "chat_messages", ["chat_group_id", "created_at"])


def downgrade() -> None:
    """Reverse the M1 schema — drops everything introduced in upgrade().

    The prior PoC schema is NOT recreated. In practice, downgrade is unused
    because `./run.sh reset` is the standard recovery path and the PoC schema
    has no production data.
    """
    bind = op.get_bind()

    op.drop_index("idx_chat_messages_group_time", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_table("chat_groups")
    op.drop_table("user_badges")
    op.drop_table("discussion_comments")
    op.drop_table("discussions")
    op.drop_table("follows")
    op.drop_table("ratings")
    op.drop_table("destination_media")
    op.drop_table("ride_media")
    op.drop_table("ride_logs")
    op.drop_table("ride_plan_participants")
    op.drop_table("ride_plans")
    op.drop_index("idx_route_points_route_order", table_name="route_points")
    op.drop_table("route_points")
    op.drop_table("routes")
    op.drop_table("destination_tags")
    op.drop_index("idx_destinations_latlng", table_name="destinations")
    op.drop_index("idx_destinations_region", table_name="destinations")
    op.drop_table("destinations")
    op.drop_table("badges")
    op.drop_table("tags")
    op.drop_table("bikes")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")

    for enum_type in reversed(NEW_ENUMS):
        enum_type.drop(bind, checkfirst=True)
