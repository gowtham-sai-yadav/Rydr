"""Shared ride-related helpers used by both the rides and chat routers.

Previously duplicated between ``routers/rides.py::_approved_counts_for`` and
``routers/chat.py::_approved_counts_for`` (M5 audit #18). Centralising here
avoids drift and keeps the routers free of router-to-router imports.
"""
from __future__ import annotations

from typing import Sequence
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ride import ParticipantStatus, RidePlanParticipant


def approved_counts_for(
    db: Session, ride_ids: Sequence[UUID]
) -> dict[UUID, int]:
    """Single-query batch count of approved participants per ride.

    Returns an empty dict when ``ride_ids`` is empty so the caller can do
    ``counts.get(rid, 0)`` without a guard.
    """
    if not ride_ids:
        return {}
    rows = (
        db.query(
            RidePlanParticipant.ride_plan_id,
            func.count(RidePlanParticipant.id),
        )
        .filter(
            RidePlanParticipant.ride_plan_id.in_(ride_ids),
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .group_by(RidePlanParticipant.ride_plan_id)
        .all()
    )
    return {rid: cnt for rid, cnt in rows}
