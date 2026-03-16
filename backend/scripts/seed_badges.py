"""Seed the badge catalog and backfill awards for every existing user (M8).

Run once after ``alembic upgrade head`` lands the d4e7b9f1c8a3 revision.
Idempotent — re-running upserts the catalog rows by slug and
re-evaluates every user (the engine itself is idempotent, so awards
already earned are not duplicated).

Why a script, not a migration
-----------------------------
Catalog content (names, descriptions, icons) is product copy and is
expected to change over the project's lifetime. Keeping it out of the
Alembic migration means we can edit the catalog without producing a
new schema revision — just re-run this script.

Icon delivery
-------------
We use Iconify's public CDN (``https://api.iconify.design/<set>/<name>.svg``)
with a ``?color=<hex>`` query param so each tier has a distinct
visual identity:

  bronze tier  → orange  (#f97316)
  silver tier  → cool blue-grey (#64748b)
  gold tier    → yellow (#facc15)
  star tier    → red    (#ef4444)

No package install needed — the frontend renders the URL as the src of
an ``<img>``. If the CDN ever goes down or we want to self-host, the
icon_url column is plain text and can be rewritten with a single
UPDATE statement.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Make ``backend/`` importable when this script is invoked as
# ``python scripts/seed_badges.py`` from inside ``backend/``.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy.dialects.postgresql import insert as pg_insert  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.badge import Badge  # noqa: E402
from app.models.user import User  # noqa: E402
from app.services.badge_engine import evaluate_user_badges  # noqa: E402


def _icon(set_name: str, icon: str, color_hex: str) -> str:
    """Build an Iconify CDN URL with a fill color."""
    return f"https://api.iconify.design/{set_name}/{icon}.svg?color=%23{color_hex}"


# ---------------------------------------------------------------------------
# Catalog
# ---------------------------------------------------------------------------
# Slug is the contract. Adding/removing badges:
#   1. Edit this list.
#   2. Edit BADGE_PREDICATES in services/badge_engine.py (matching slug).
#   3. Re-run this script.
#
# We deliberately picked icons that read at small sizes (profile chips)
# without needing color to disambiguate — a captain helmet, a star, a
# trophy, etc. The tier color is a secondary cue.
BRONZE = "f97316"
SILVER = "64748b"
GOLD = "facc15"
STAR = "ef4444"

CATALOG: list[dict] = [
    {
        "slug": "first-ride",
        "name": "First Ride",
        "description": "Completed your very first ride. Welcome to the road.",
        "icon_url": _icon("mdi", "motorbike", BRONZE),
    },
    {
        "slug": "rider-bronze",
        "name": "Three Rides Strong",
        "description": "Completed 3 rides. The habit is forming.",
        "icon_url": _icon("mdi", "medal-outline", BRONZE),
    },
    {
        "slug": "rider-silver",
        "name": "Six Rides Strong",
        "description": "Completed 6 rides. You're a regular now.",
        "icon_url": _icon("mdi", "medal", SILVER),
    },
    {
        "slug": "rider-gold",
        "name": "Ten Rides Strong",
        "description": "Completed 10 rides. The mountain is yours.",
        "icon_url": _icon("mdi", "trophy", GOLD),
    },
    {
        "slug": "captain-bronze",
        "name": "First Captain",
        "description": "Captained your first ride. Others trusted your call.",
        "icon_url": _icon("mdi", "compass-outline", BRONZE),
    },
    {
        "slug": "captain-silver",
        "name": "Squad Leader",
        "description": "Captained 5 rides. You set the pace.",
        "icon_url": _icon("mdi", "compass", SILVER),
    },
    {
        "slug": "joiner-bronze",
        "name": "Joiner",
        "description": "Joined 3 ride groups. Showing up is half the ride.",
        "icon_url": _icon("mdi", "account-group", BRONZE),
    },
    {
        "slug": "star-rider",
        "name": "Star Rider",
        "description": "Completed 3 rides and left a 5-star destination review.",
        "icon_url": _icon("mdi", "star-circle", STAR),
    },
]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def upsert_catalog(db) -> tuple[int, int]:
    """Insert missing rows; update name/description/icon_url for
    existing rows. Returns (inserted, updated) counts."""
    inserted = 0
    updated = 0
    for entry in CATALOG:
        existing = db.query(Badge).filter(Badge.slug == entry["slug"]).first()
        if existing is None:
            db.execute(pg_insert(Badge).values(**entry))
            inserted += 1
        else:
            changed = False
            for field in ("name", "description", "icon_url"):
                if getattr(existing, field) != entry[field]:
                    setattr(existing, field, entry[field])
                    changed = True
            if changed:
                updated += 1
    db.commit()
    return inserted, updated


def backfill_awards(db) -> dict[str, int]:
    """Run the engine for every user. Returns slug → total-earned tally
    across the platform for a quick summary print."""
    user_ids = [row[0] for row in db.query(User.id).all()]
    for uid in user_ids:
        evaluate_user_badges(db, uid)

    # Quick post-fact tally so the run log shows the impact.
    from app.models.badge import UserBadge

    counts: dict[str, int] = {}
    for slug, total in (
        db.query(Badge.slug, Badge.id)
        .all()
    ):
        n = (
            db.query(UserBadge)
            .filter(UserBadge.badge_id == total)
            .count()
        )
        counts[slug] = n
    return counts


def main() -> None:
    db = SessionLocal()
    try:
        print("Seeding badge catalog...")
        inserted, updated = upsert_catalog(db)
        print(f"  catalog: {inserted} inserted, {updated} updated, "
              f"{len(CATALOG) - inserted - updated} unchanged")

        print("Backfilling awards for all existing users...")
        tally = backfill_awards(db)
        for slug in (b["slug"] for b in CATALOG):
            print(f"  {slug:18s} {tally.get(slug, 0)} earned")

        print("✓ Seed complete")
    finally:
        db.close()


if __name__ == "__main__":
    main()
