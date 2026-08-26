"""Leaderboard router — Phase 4 W5.

  GET /riders          — top riders by number of ride logs posted (all time)
  GET /destinations     — most-ridden destinations this calendar month
                           (completed rides only)
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.destination import Destination
from app.models.ride import RidePlan, RidePlanStatus
from app.models.ride_log import RideLog
from app.models.user import User
from app.schemas.leaderboard import (
    DestinationLeaderboardEntry,
    DestinationLeaderboardResponse,
    RiderLeaderboardEntry,
    RiderLeaderboardResponse,
)
from app.schemas.user import UserBrief

router = APIRouter()


@router.get("/riders", response_model=RiderLeaderboardResponse)
def rider_leaderboard(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> RiderLeaderboardResponse:
    rows = (
        db.query(User, func.count(RideLog.id).label("rides_logged"))
        .join(RideLog, RideLog.rider_id == User.id)
        .group_by(User.id)
        .order_by(func.count(RideLog.id).desc(), User.id.asc())
        .limit(limit)
        .all()
    )
    entries = [
        RiderLeaderboardEntry(
            rank=i + 1,
            user=UserBrief.model_validate(user),
            rides_logged=rides_logged,
        )
        for i, (user, rides_logged) in enumerate(rows)
    ]
    return RiderLeaderboardResponse(entries=entries)


@router.get("/destinations", response_model=DestinationLeaderboardResponse)
def destination_leaderboard(
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> DestinationLeaderboardResponse:
    today = date.today()
    month_start = today.replace(day=1)

    rows = (
        db.query(Destination, func.count(RidePlan.id).label("ride_count"))
        .join(RidePlan, RidePlan.destination_id == Destination.id)
        .filter(
            RidePlan.status == RidePlanStatus.completed,
            RidePlan.planned_date >= month_start,
            RidePlan.planned_date <= today,
        )
        .group_by(Destination.id)
        .order_by(func.count(RidePlan.id).desc(), Destination.id.asc())
        .limit(limit)
        .all()
    )
    entries = [
        DestinationLeaderboardEntry(
            rank=i + 1,
            destination_id=dest.id,
            destination_name=dest.name,
            ride_count=ride_count,
        )
        for i, (dest, ride_count) in enumerate(rows)
    ]
    return DestinationLeaderboardResponse(entries=entries)
