"""p4 search + filter indexes

Phase 4 W7 — "Add DB indexes for search/filter queries".

Every index here was chosen by running EXPLAIN (ANALYZE, BUFFERS) against a
seeded dataset of 20k destinations, 30k ride plans and 30k ride logs, not by
inspection. The measured before/after is recorded in the commit message.

pg_trgm
-------
The destination search is ``name ILIKE '%term%'``, and a leading wildcard
cannot use a btree index — Postgres must scan every row. On the seeded data a
search that matches nothing took 8.7ms and read the whole table; matching
searches only looked fast because LIMIT 20 let them stop early, which stops
being true as soon as a term is rare.

pg_trgm is a Postgres contrib extension, bundled with the official image and
with every managed Postgres worth deploying to. It is not a new service or a
new Python dependency. ``CREATE EXTENSION`` needs elevated rights; if the
deploy role lacks them, this migration fails loudly at that statement rather
than silently skipping the index, which is the right failure — an operator can
then create the extension once by hand and re-run.

Ordered indexes
---------------
The two destination sorts fold their direction into the index, so the planner
streams rows out in order instead of sorting 20k rows to return 20. ``id`` is
included as the final key because the queries carry it as a tiebreaker, and an
index that stops one column short of the ORDER BY cannot serve the sort.

Revision ID: f4b8d1e6c9a3
Revises: e8a3c5d7b2f4
Create Date: 2026-08-28 00:50:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f4b8d1e6c9a3"
down_revision: Union[str, None] = "e8a3c5d7b2f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # --- destinations: the two list sorts -------------------------------
    op.create_index(
        "idx_destinations_rating",
        "destinations",
        [sa.text("avg_rating DESC"), sa.text("rating_count DESC"), "id"],
    )
    op.create_index(
        "idx_destinations_popularity",
        "destinations",
        [sa.text("rating_count DESC"), sa.text("avg_rating DESC"), "id"],
    )

    # --- destinations: substring search ---------------------------------
    # GIN over trigrams. gin_trgm_ops is what makes ILIKE '%term%' indexable.
    op.execute(
        "CREATE INDEX idx_destinations_name_trgm ON destinations "
        "USING gin (name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX idx_destinations_region_trgm ON destinations "
        "USING gin (region gin_trgm_ops)"
    )

    # --- reverse lookups the composite primary keys do not serve --------
    # destination_tags' PK is (destination_id, tag_id), which cannot answer
    # "which destinations carry this tag" — the tag filter's inner lookup.
    op.create_index("idx_destination_tags_tag", "destination_tags", ["tag_id"])

    # uq_ride_log_ride_rider is (ride_plan_id, rider_id): no help for the
    # personal stats dashboard, which reads by rider.
    op.create_index("idx_ride_logs_rider", "ride_logs", ["rider_id"])

    # uq_participant_ride_user is (ride_plan_id, user_id): no help for
    # /api/rides/mine, which reads by user.
    op.create_index(
        "idx_participants_user_status",
        "ride_plan_participants",
        ["user_id", "status"],
    )

    # --- plain foreign-key lookups Postgres does not index automatically -
    op.create_index("idx_ride_media_log", "ride_media", ["ride_log_id"])
    op.create_index(
        "idx_destination_media_destination", "destination_media", ["destination_id"]
    )
    op.create_index("idx_ratings_ride_log", "ratings", ["ride_log_id"])
    op.create_index(
        "idx_ride_plans_destination_status",
        "ride_plans",
        ["destination_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("idx_ride_plans_destination_status", table_name="ride_plans")
    op.drop_index("idx_ratings_ride_log", table_name="ratings")
    op.drop_index(
        "idx_destination_media_destination", table_name="destination_media"
    )
    op.drop_index("idx_ride_media_log", table_name="ride_media")
    op.drop_index(
        "idx_participants_user_status", table_name="ride_plan_participants"
    )
    op.drop_index("idx_ride_logs_rider", table_name="ride_logs")
    op.drop_index("idx_destination_tags_tag", table_name="destination_tags")
    op.execute("DROP INDEX IF EXISTS idx_destinations_region_trgm")
    op.execute("DROP INDEX IF EXISTS idx_destinations_name_trgm")
    op.drop_index("idx_destinations_popularity", table_name="destinations")
    op.drop_index("idx_destinations_rating", table_name="destinations")
    # pg_trgm is deliberately left installed. Dropping an extension is not
    # this revision's business: another index or another application on the
    # same database may depend on it.
