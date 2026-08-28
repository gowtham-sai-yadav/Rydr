"""Ride capacity accounting and the waitlist queue — Phase 4 W6.

``RidePlan.max_riders`` has existed since M1 but nothing ever read it: a
captain could approve unlimited riders into a ride advertised as "10 max".
This module is the single place that decides whether a seat exists, and the
single place that fills a seat when one frees up.

Seat accounting
---------------
A seat is consumed by an ``approved`` participant. The captain is auto-joined
as ``approved`` at ride creation (M3 decision), so the captain occupies one of
the ``max_riders`` seats — a ride with ``max_riders=10`` seats the captain
plus nine others. ``pending``, ``waitlisted``, ``rejected`` and ``left`` rows
consume nothing.

Concurrency
-----------
Two captains' browser tabs approving the last seat at the same moment would
both pass a naive ``count < max_riders`` check and overfill the ride. Every
mutation that can consume or free a seat therefore takes a row lock on the
``ride_plans`` row first via :func:`lock_ride`. Postgres serialises the
transactions on that row, so the second one re-reads the count after the first
commits. The lock is on the ride, not the participant, because the invariant
being protected ("approved count <= max_riders") is per-ride.

Waitlist ordering
-----------------
Promotion is first-in-first-out by ``updated_at``, not ``created_at``.
``created_at`` is the timestamp of the participant row, which the join
endpoint's ``ON CONFLICT DO UPDATE`` preserves across a leave-and-rejoin — so
ordering by it would hand a rider who left and came back their original place
in the queue, ahead of people who had been waiting the whole time.
``updated_at`` is bumped on every status transition and is the time the rider
actually entered the waitlist. ``id`` breaks ties so the order is total and
stable.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ride import ParticipantStatus, RidePlan, RidePlanParticipant


@dataclass(frozen=True)
class CapacitySnapshot:
    """What the capacity of a ride looks like right now."""

    max_riders: int
    seats_taken: int
    waitlist_count: int

    @property
    def seats_available(self) -> int:
        # Clamped at zero: a captain can lower max_riders below the current
        # approved count (existing riders are never bumped), which would
        # otherwise surface as a negative number in the API response.
        return max(0, self.max_riders - self.seats_taken)

    @property
    def is_full(self) -> bool:
        return self.seats_available == 0


def lock_ride(db: Session, ride_id: UUID) -> None:
    """Take a row lock on the ride for the rest of the transaction.

    Call this before reading a count that a subsequent write depends on.
    No-op if the ride does not exist — the caller's own 404 handles that.
    """
    db.execute(select(RidePlan.id).where(RidePlan.id == ride_id).with_for_update())


def seats_taken(db: Session, ride_id: UUID) -> int:
    """Count of approved participants, i.e. seats currently consumed."""
    return (
        db.query(func.count(RidePlanParticipant.id))
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .scalar()
        or 0
    )


def waitlist_count(db: Session, ride_id: UUID) -> int:
    return (
        db.query(func.count(RidePlanParticipant.id))
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.status == ParticipantStatus.waitlisted,
        )
        .scalar()
        or 0
    )


def snapshot(db: Session, ride: RidePlan) -> CapacitySnapshot:
    return CapacitySnapshot(
        max_riders=ride.max_riders,
        seats_taken=seats_taken(db, ride.id),
        waitlist_count=waitlist_count(db, ride.id),
    )


def promote_from_waitlist(db: Session, ride: RidePlan) -> List[RidePlanParticipant]:
    """Fill every free seat from the head of the waitlist.

    Returns the participants promoted to ``approved``, oldest first, so the
    caller can notify them. Returns an empty list when the ride is full or the
    waitlist is empty. Does not commit — the caller owns the transaction, which
    keeps the promotion atomic with whatever freed the seat.

    Assumes the caller already holds the ride lock from :func:`lock_ride`.
    """
    free = ride.max_riders - seats_taken(db, ride.id)
    if free <= 0:
        return []

    queue = (
        db.query(RidePlanParticipant)
        .filter(
            RidePlanParticipant.ride_plan_id == ride.id,
            RidePlanParticipant.status == ParticipantStatus.waitlisted,
        )
        .order_by(
            RidePlanParticipant.updated_at.asc(),
            RidePlanParticipant.id.asc(),
        )
        .limit(free)
        .all()
    )
    for participant in queue:
        participant.status = ParticipantStatus.approved
    return queue
