"""p4 media thumbnails

Phase 4 W3 — adds ``thumbnail_url`` to ride_media and destination_media.

Nullable, because a thumbnail can only be derived for Cloudinary-hosted
assets: the M4 confirm-media path accepts any https URL so the flow works
with Cloudinary unconfigured, and those rows legitimately have no derived
poster. A null here means "render the original", not "missing data".

Backfill is deliberately omitted. The value is a pure function of the url
column, so existing rows can be filled by re-running the derivation at any
time, and doing it inside a migration would mean an UPDATE over every media
row for a field the read path already treats as optional.

Revision ID: d7f2b4e9a1c6
Revises: c3e6a9d2f5b8
Create Date: 2026-08-28 00:30:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7f2b4e9a1c6"
down_revision: Union[str, None] = "c3e6a9d2f5b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ride_media",
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "destination_media",
        sa.Column("thumbnail_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("destination_media", "thumbnail_url")
    op.drop_column("ride_media", "thumbnail_url")
