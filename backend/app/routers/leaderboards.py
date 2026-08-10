"""Leaderboard router — Phase 4 W5.

  GET /api/leaderboards/riders        — riders by estimated distance
  GET /api/leaderboards/destinations  — "most ridden" destinations

Both take ``?period=week|month|year|all`` (default ``month``, matching the
plan's "most-ridden this month" framing) and are readable without auth, since
a leaderboard nobody can see until they sign up is not much of a hook. When
the caller *is* authenticated, the rider board also reports ``my_rank`` so
they can see where they stand without scrolling for themselves.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_optional_user
from app.models.user import User
from app.schemas.leaderboard import (
    DestinationLeaderboardEntry,
    DestinationLeaderboardResponse,
    RiderLeaderboardEntry,
    RiderLeaderboardResponse,
)
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
