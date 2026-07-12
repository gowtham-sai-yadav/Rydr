"""Leaderboard router — Phase 4 W5.

  GET /riders          — top riders by number of ride logs posted (all time)
  GET /destinations     — most-ridden destinations this calendar month
                           (completed rides only)
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
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
    LocalLegendOut,
    RiderLeaderboardEntry,
    RiderLeaderboardResponse,
    WeeklyLeagueResponse,
    WeeklyLeagueTier,
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


@router.get("/destinations/{destination_id}/local-legend", response_model=LocalLegendOut)
def local_legend(destination_id: UUID, db: Session = Depends(get_db)) -> LocalLegendOut:
    """Whoever's completed the most rides to this destination in the last
    90 days — refreshes naturally on every request since it's just a
    windowed count, not a stored/awarded badge, so there's no stale
    "legend" left holding the title after they stop visiting."""
    if not db.query(Destination.id).filter(Destination.id == destination_id).first():
        raise HTTPException(status_code=404, detail="Destination not found")

    window_start = datetime.now(timezone.utc) - timedelta(days=90)
    row = (
        db.query(User, func.count(RideLog.id).label("ride_count"))
        .join(RideLog, RideLog.rider_id == User.id)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RidePlan.destination_id == destination_id,
            RideLog.actual_start_ts >= window_start,
        )
        .group_by(User.id)
        .order_by(func.count(RideLog.id).desc(), User.id.asc())
        .first()
    )
    if row is None:
        return LocalLegendOut(destination_id=destination_id, user=None, ride_count=0)
    user, ride_count = row
    return LocalLegendOut(destination_id=destination_id, user=UserBrief.model_validate(user), ride_count=ride_count)


@router.get("/weekly-league", response_model=WeeklyLeagueResponse)
def weekly_league(db: Session = Depends(get_db)) -> WeeklyLeagueResponse:
    """Bronze/silver/gold tiers by this week's distance, so casual and
    serious riders aren't ranked against each other in one flat list —
    top third of active riders is gold, next third silver, rest bronze.
    Riders with zero distance this week don't appear at all (no
    ride-day = not in a league yet, not "last place")."""
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())

    rows = (
        db.query(User, func.sum(RideLog.distance_km).label("distance_km"))
        .join(RideLog, RideLog.rider_id == User.id)
        .filter(
            RideLog.distance_km.isnot(None),
            RideLog.actual_start_ts >= datetime.combine(week_start, datetime.min.time(), tzinfo=timezone.utc),
        )
        .group_by(User.id)
        .order_by(func.sum(RideLog.distance_km).desc())
        .limit(100)
        .all()
    )

    total = len(rows)
    tiers: list[WeeklyLeagueTier] = []
    for i, (user, distance_km) in enumerate(rows):
        if total <= 2:
            tier = "gold"
        elif i < total / 3:
            tier = "gold"
        elif i < 2 * total / 3:
            tier = "silver"
        else:
            tier = "bronze"
        tiers.append(
            WeeklyLeagueTier(tier=tier, rank=i + 1, user=UserBrief.model_validate(user), distance_km=round(distance_km, 1))
        )

    return WeeklyLeagueResponse(week_start=week_start.isoformat(), tiers=tiers)
