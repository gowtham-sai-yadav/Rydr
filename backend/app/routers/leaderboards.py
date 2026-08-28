"""Leaderboard router — Phase 4 W5.

  GET /api/leaderboards/riders        — riders by estimated distance
  GET /api/leaderboards/destinations  — "most ridden" destinations
  GET /api/leaderboards/destinations/{id}/local-legend — most rides to one place, 90d window
  GET /api/leaderboards/weekly-league — gold/silver/bronze tiers by this week's tracked distance

Both of the first two take ``?period=week|month|year|all`` (default
``month``, matching the plan's "most-ridden this month" framing) and are
readable without auth, since a leaderboard nobody can see until they sign
up is not much of a hook. When the caller *is* authenticated, the rider
board also reports ``my_rank`` so they can see where they stand without
scrolling for themselves.

Local Legend and the Weekly League are windowed differently on purpose:
they're drawn from ``RideLog.distance_km`` (a real recorded GPS track),
not the estimated-distance heuristic the two endpoints above use, so a
"legend" or a league tier is only ever earned by an actually-tracked ride.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_optional_user
from app.models.destination import Destination
from app.models.ride import RidePlan
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
from app.services import stats

router = APIRouter()

_PERIODS = {"week", "month", "year", "all"}


def _since_for(period: str) -> Optional[date]:
    """Start date for a period label, or None for all-time."""
    if period not in _PERIODS:
        raise HTTPException(
            status_code=422,
            detail=f"period must be one of {sorted(_PERIODS)}",
        )
    today = datetime.now(timezone.utc).date()
    if period == "week":
        return today - timedelta(days=today.weekday())
    if period == "month":
        return today.replace(day=1)
    if period == "year":
        return today.replace(month=1, day=1)
    return None


@router.get("/riders", response_model=RiderLeaderboardResponse)
def riders(
    period: str = Query(default="month"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
) -> RiderLeaderboardResponse:
    since = _since_for(period)
    rows = stats.rider_leaderboard(db, since=since, limit=limit)

    my_rank = None
    if viewer is not None:
        # Look for the caller in the returned page first. Only if they are
        # outside it do we pay for a wider query, and that one is still capped
        # so a large user base can't turn this endpoint into a full scan.
        hit = next((r for r in rows if r.user_id == viewer.id), None)
        if hit is not None:
            my_rank = hit.rank
        else:
            wider = stats.rider_leaderboard(db, since=since, limit=1000)
            hit = next((r for r in wider if r.user_id == viewer.id), None)
            my_rank = hit.rank if hit else None

    return RiderLeaderboardResponse(
        period=period,
        entries=[
            RiderLeaderboardEntry(
                rank=r.rank,
                user_id=r.user_id,
                name=r.name,
                avatar_url=r.avatar_url,
                rides=r.rides,
                estimated_distance_km=r.estimated_distance_km,
            )
            for r in rows
        ],
        my_rank=my_rank,
    )


@router.get("/destinations", response_model=DestinationLeaderboardResponse)
def destinations(
    period: str = Query(default="month"),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
) -> DestinationLeaderboardResponse:
    since = _since_for(period)
    rows = stats.destination_leaderboard(db, since=since, limit=limit)
    return DestinationLeaderboardResponse(
        period=period,
        entries=[
            DestinationLeaderboardEntry(
                rank=r.rank,
                destination_id=r.destination_id,
                name=r.name,
                region=r.region,
                hero_media_url=r.hero_media_url,
                avg_rating=r.avg_rating,
                ride_count=r.ride_count,
                unique_riders=r.unique_riders,
            )
            for r in rows
        ],
    )


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
