"""Badge evaluation engine (M8).

One public entry point — ``evaluate_user_badges(db, user_id)`` — that
recomputes which catalog badges a user qualifies for and inserts any
missing awards. The ``uq_user_badge`` unique constraint plus
``ON CONFLICT DO NOTHING`` make the call safe to re-run; idempotency is
the property that lets us call it from multiple trigger points (ride
status change, ride-log create, participant approval) without worrying
about double-awarding.

Predicate definitions live in ``BADGE_PREDICATES``. Adding a badge =
seed a catalog row with the matching slug + add an entry to the table.
No router changes, no migration changes.

Why synchronous, in-process
---------------------------
Catalog is fixed at 8 rows. A full evaluation is 4 SELECTs (the stats)
plus at most 8 INSERTs in a single transaction. At the platform's
current scale (~7 users, dozens of rides) this is < 5 ms and avoids
introducing a background worker / queue. If we ever ship a real
notification surface or grow the catalog past ~50 badges, move this to
a post-commit hook + outbox table.

Why a separate ``compute_stats`` helper
---------------------------------------
The ``/api/users/me/stats`` endpoint computes nearly the same numbers
(rides_completed, rides_captained, rides_joined). Today they're
duplicated — by design, since the stats endpoint pre-dates badges and
its semantics for "completed" is "captain marked the ride completed"
whereas badge semantics is "the user personally posted a ride log."
Keeping the two computations distinct lets us tune each without
breaking the other.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Tuple
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.badge import Badge, UserBadge
from app.models.destination import Rating
from app.models.notification import EntityType, NotificationType
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
)
from app.models.ride_log import RideLog
from app.services import notifications as notification_service


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class UserBadgeStats:
    """Counts + boolean flags consumed by the predicate table.

    - ``rides_completed``: number of RideLog rows the user personally
      owns. Treating a log as the canonical "I finished this ride"
      signal — see plan §3 decision #3.
    - ``rides_captained``: distinct RidePlan rows where the user is
      captain.
    - ``rides_joined``: approved RidePlanParticipant rows for rides
      this user did NOT captain. Excludes the auto-self-join — see
      plan §3 decision #4.
    - ``has_five_star_rating``: user has posted at least one 5-star
      destination rating. Powers the star-tier predicate.
    """

    rides_completed: int
    rides_captained: int
    rides_joined: int
    has_five_star_rating: bool


def compute_stats(db: Session, user_id: UUID) -> UserBadgeStats:
    """Four cheap aggregate queries — one per axis. No joins needed.

    Each axis is indexed (ride_logs.rider_id, ride_plans.captain_id,
    ride_plan_participants composite, ratings.user_id) so these are
    seek-only scans.
    """
    rides_completed = (
        db.query(func.count(RideLog.id))
        .filter(RideLog.rider_id == user_id)
        .scalar()
        or 0
    )

    rides_captained = (
        db.query(func.count(RidePlan.id))
        .filter(RidePlan.captain_id == user_id)
        .scalar()
        or 0
    )

    # Subquery: ride plans where this user is captain. We exclude those
    # from the joiner count so that captains don't earn the joiner
    # badge from their auto-self-join row.
    captained_subq = (
        select(RidePlan.id).where(RidePlan.captain_id == user_id).scalar_subquery()
    )
    rides_joined = (
        db.query(func.count(RidePlanParticipant.id))
        .filter(
            and_(
                RidePlanParticipant.user_id == user_id,
                RidePlanParticipant.status == ParticipantStatus.approved,
                RidePlanParticipant.ride_plan_id.notin_(captained_subq),
            )
        )
        .scalar()
        or 0
    )

    has_five_star = (
        db.query(Rating.id)
        .filter(and_(Rating.user_id == user_id, Rating.stars == 5))
        .limit(1)
        .first()
        is not None
    )

    return UserBadgeStats(
        rides_completed=int(rides_completed),
        rides_captained=int(rides_captained),
        rides_joined=int(rides_joined),
        has_five_star_rating=has_five_star,
    )


# ---------------------------------------------------------------------------
# Predicate table
# ---------------------------------------------------------------------------
# Pure functions from stats → bool. Order does not matter; ``evaluate``
# iterates the whole catalog. Adding a badge: add a row to the catalog
# (see scripts/seed_badges.py) with the matching slug, and add an entry
# here keyed on the same slug.
BADGE_PREDICATES: Dict[str, Callable[[UserBadgeStats], bool]] = {
    "first-ride": lambda s: s.rides_completed >= 1,
    "rider-bronze": lambda s: s.rides_completed >= 3,
    "rider-silver": lambda s: s.rides_completed >= 6,
    "rider-gold": lambda s: s.rides_completed >= 10,
    "captain-bronze": lambda s: s.rides_captained >= 1,
    "captain-silver": lambda s: s.rides_captained >= 5,
    "joiner-bronze": lambda s: s.rides_joined >= 3,
    "star-rider": lambda s: s.rides_completed >= 3 and s.has_five_star_rating,
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def evaluate_user_badges(db: Session, user_id: UUID) -> List[Tuple[UUID, str, str]]:
    """Compute the user's stats and insert any newly-qualifying badges.

    Returns ``(badge_id, slug, name)`` for each NEWLY inserted award — empty
    when the user already had everything they qualified for, or qualifies for
    nothing yet. Phase 4 W5 widened this from a bare count so the caller can
    name the badge in the "you earned X" notification without a second query;
    ``len(result)`` is the old return value.

    Implementation notes:
    - One INSERT per qualifying badge. ``on_conflict_do_nothing``
      against ``uq_user_badge`` is what gives us idempotency — calling
      this twice in a row inserts zero on the second call.
    - We do NOT remove badges the user no longer qualifies for. The
      product decision is "once earned, kept" (plan §3 decision #6).
    - Single ``db.commit()`` at the end keeps the trigger callsites
      simple — they don't have to manage a nested transaction.
    """
    stats = compute_stats(db, user_id)

    # Load only the badges this user qualifies for. Loading all 8 every
    # time is fine at current scale, but filtering keeps the INSERT
    # count tight and the log line meaningful.
    qualifying_slugs = [
        slug for slug, predicate in BADGE_PREDICATES.items() if predicate(stats)
    ]
    if not qualifying_slugs:
        return []

    catalog_rows = (
        db.query(Badge.id, Badge.slug, Badge.name)
        .filter(Badge.slug.in_(qualifying_slugs))
        .all()
    )

    awarded: List[Tuple[UUID, str, str]] = []
    for badge_id, slug, name in catalog_rows:
        stmt = (
            pg_insert(UserBadge)
            .values(user_id=user_id, badge_id=badge_id)
            .on_conflict_do_nothing(constraint="uq_user_badge")
            .returning(UserBadge.id)
        )
        inserted_id = db.execute(stmt).scalar_one_or_none()
        if inserted_id is not None:
            awarded.append((badge_id, slug, name))

    if awarded:
        db.commit()
    return awarded


def safe_evaluate(db: Session, user_id: UUID) -> None:
    """Fire-and-forget wrapper for use inside router handlers.

    Badge awarding is a side effect of the user's primary action
    (completing a ride, posting a log, approving a join). A failure in
    the engine should NEVER fail the parent write — the user would see
    a 500 for what they perceived as a successful action.

    We swallow exceptions here and rely on the catalog being seeded
    correctly. If the engine errors we'd see it in logs but the
    parent write succeeds.

    Phase 4 W5: a newly earned badge also raises a notification. Delivery goes
    through ``safe_notify_commit``, which has its own savepoint and its own
    swallow, so a notification problem cannot undo an award that was already
    committed.
    """
    try:
        awarded = evaluate_user_badges(db, user_id)
    except Exception:  # noqa: BLE001 — intentional swallow for side-effect
        # The session may be in a bad state after a failed flush; roll
        # back so subsequent operations on the session can proceed.
        db.rollback()
        return

    for badge_id, _slug, name in awarded:
        notification_service.safe_notify_commit(
            db,
            user_id=user_id,
            type=NotificationType.badge_earned,
            title=f"Badge unlocked: {name}",
            body="Tap to see it on your profile.",
            entity_type=EntityType.badge,
            entity_id=badge_id,
        )
