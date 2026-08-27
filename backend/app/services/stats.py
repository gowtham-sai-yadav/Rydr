"""Rider statistics and leaderboards — Phase 4 W5.

Covers three things the plan asks for: the rider leaderboard (§1.3
Gamification), the "most-ridden this month" destination leaderboard (§1.4),
and the personal stats dashboard with weekly/monthly distance and streaks
(§1.4), all built from ride-log data that already exists.

Distance
--------
Rydr does not record a distance on the ride log — there is no GPS track and no
odometer field. Distance is therefore *derived*: the great-circle distance from
the rider's home location to the destination, doubled for the return leg. That
is an estimate and is named as one everywhere it surfaces
(``estimated_distance_km``), because presenting a straight-line approximation
as a measured value would be a lie the UI then repeats.

Riders with no home location contribute zero distance rather than being
excluded from the leaderboard: they still have a ride count, and dropping them
entirely would make the board look broken to the person affected. The API
returns ``has_home_location`` so the client can prompt them to set one.

Only ``completed`` rides count toward any statistic. A planned ride is an
intention, and counting intentions would make the leaderboard trivially
gameable by creating rides nobody takes.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from sqlalchemy import Float, case, func, literal
from sqlalchemy.orm import Session

from app.models.destination import Destination
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.ride_log import RideLog
from app.models.user import User

# Imported, not redeclared. A local copy rounded to 6371.0 would disagree
# with the destination list's distance_km by roughly 0.01% — small, but the
# two numbers appear on adjacent screens for the same journey, and "46.2 km"
# on one page against "46.3 km" on another is the kind of inconsistency that
# makes a user distrust both.
from app.services.geo import EARTH_RADIUS_KM, haversine_km


def _haversine_km_sql(lat1, lon1, lat2, lon2):
    """Great-circle distance as a SQL expression.

    The Python helper in ``services/geo`` cannot be used here: these
    aggregates run over thousands of rows inside a GROUP BY, and pulling every
    row into Python to sum them would defeat the point of the query. The
    formula is the same one, transcribed into SQL functions.
    """
    lat1_r = func.radians(lat1)
    lat2_r = func.radians(lat2)
    dlat = func.radians(lat2 - lat1)
    dlon = func.radians(lon2 - lon1)
    a = func.sin(dlat / 2) * func.sin(dlat / 2) + func.cos(lat1_r) * func.cos(
        lat2_r
    ) * func.sin(dlon / 2) * func.sin(dlon / 2)
    return literal(EARTH_RADIUS_KM) * 2 * func.asin(func.sqrt(a))


def _round_trip_km():
    """Estimated km for one completed ride: home -> destination -> home.

    Zero when the rider has no home location on file, so the SUM stays a
    number instead of going NULL and wiping out the rider's whole total.
    """
    return case(
        (
            User.home_latitude.isnot(None) & User.home_longitude.isnot(None),
            _haversine_km_sql(
                User.home_latitude,
                User.home_longitude,
                Destination.latitude,
                Destination.longitude,
            )
            * 2,
        ),
        else_=literal(0.0),
    ).cast(Float)


def _completed_logs_query(db: Session):
    """Base query: one row per completed, logged ride, joined to rider+place."""
    return (
        db.query(RideLog)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .join(Destination, Destination.id == RidePlan.destination_id)
        .join(User, User.id == RideLog.rider_id)
        .filter(RidePlan.status == RidePlanStatus.completed)
    )


# ---------------------------------------------------------------------------
# Rider leaderboard
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class RiderRow:
    user_id: UUID
    name: str
    avatar_url: Optional[str]
    rides: int
    estimated_distance_km: float
    rank: int


def rider_leaderboard(
    db: Session, *, since: Optional[date] = None, limit: int = 20
) -> List[RiderRow]:
    """Riders ranked by estimated distance, then by ride count.

    ``since`` filters on the ride's planned date, which is the date the ride
    happened. Passing None ranks all time.
    """
    q = (
        _completed_logs_query(db)
        .with_entities(
            User.id.label("user_id"),
            User.name.label("name"),
            User.avatar_url.label("avatar_url"),
            func.count(RideLog.id).label("rides"),
            func.coalesce(func.sum(_round_trip_km()), 0.0).label("km"),
        )
        .group_by(User.id, User.name, User.avatar_url)
    )
    if since is not None:
        q = q.filter(RidePlan.planned_date >= since)

    rows = (
        q.order_by(
            func.coalesce(func.sum(_round_trip_km()), 0.0).desc(),
            func.count(RideLog.id).desc(),
            # Stable final tiebreak so equal riders don't shuffle between
            # requests, which would make the board look unreliable.
            User.id.asc(),
        )
        .limit(limit)
        .all()
    )
    return [
        RiderRow(
            user_id=r.user_id,
            name=r.name,
            avatar_url=r.avatar_url,
            rides=r.rides,
            estimated_distance_km=round(float(r.km or 0.0), 1),
            rank=i,
        )
        for i, r in enumerate(rows, start=1)
    ]


# ---------------------------------------------------------------------------
# Destination leaderboard — "most ridden this month"
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class DestinationRow:
    destination_id: UUID
    name: str
    region: Optional[str]
    hero_media_url: Optional[str]
    avg_rating: float
    ride_count: int
    unique_riders: int
    rank: int


def destination_leaderboard(
    db: Session, *, since: Optional[date] = None, limit: int = 20
) -> List[DestinationRow]:
    """Destinations ranked by completed rides, then by distinct riders.

    Distinct riders is the secondary key on purpose: a destination ridden
    twenty times by one person is less interesting than one ridden ten times
    by ten people, and ranking on raw count alone rewards the former.
    """
    q = (
        _completed_logs_query(db)
        .with_entities(
            Destination.id.label("destination_id"),
            Destination.name.label("name"),
            Destination.region.label("region"),
            Destination.hero_media_url.label("hero_media_url"),
            Destination.avg_rating.label("avg_rating"),
            func.count(RideLog.id).label("ride_count"),
            func.count(func.distinct(RideLog.rider_id)).label("unique_riders"),
        )
        .group_by(
            Destination.id,
            Destination.name,
            Destination.region,
            Destination.hero_media_url,
            Destination.avg_rating,
        )
    )
    if since is not None:
        q = q.filter(RidePlan.planned_date >= since)

    rows = (
        q.order_by(
            func.count(RideLog.id).desc(),
            func.count(func.distinct(RideLog.rider_id)).desc(),
            Destination.id.asc(),
        )
        .limit(limit)
        .all()
    )
    return [
        DestinationRow(
            destination_id=r.destination_id,
            name=r.name,
            region=r.region,
            hero_media_url=r.hero_media_url,
            avg_rating=float(r.avg_rating or 0.0),
            ride_count=r.ride_count,
            unique_riders=r.unique_riders,
            rank=i,
        )
        for i, r in enumerate(rows, start=1)
    ]


# ---------------------------------------------------------------------------
# Personal dashboard
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class PersonalStats:
    rides_captained: int
    rides_joined: int
    rides_completed: int
    total_distance_km: float
    distance_this_week_km: float
    distance_this_month_km: float
    rides_this_week: int
    rides_this_month: int
    longest_ride_km: float
    current_streak_weeks: int
    longest_streak_weeks: int
    destinations_visited: int
    has_home_location: bool


def _monday_of(d: date) -> date:
    """Start of the ISO week containing ``d``.

    Streaks are counted in weeks rather than days because riding is a weekend
    activity — the plan's own framing is "where should I ride this weekend?" —
    so a day-based streak would break for everyone with a job and measure
    nothing useful.
    """
    return d - timedelta(days=d.weekday())


def _streaks(ride_dates: List[date]) -> tuple[int, int]:
    """Return (current, longest) run of consecutive ISO weeks with a ride."""
    if not ride_dates:
        return 0, 0

    weeks = sorted({_monday_of(d) for d in ride_dates})

    longest = current_run = 1
    for prev, nxt in zip(weeks, weeks[1:]):
        if (nxt - prev).days == 7:
            current_run += 1
            longest = max(longest, current_run)
        else:
            current_run = 1

    # The current streak only counts if it reaches this week or last week.
    # Requiring this week alone would show a rider who rode on Sunday a zero
    # streak every Monday morning, which reads as a bug.
    today = datetime.now(timezone.utc).date()
    this_week = _monday_of(today)
    if weeks[-1] not in (this_week, this_week - timedelta(days=7)):
        return 0, longest

    return current_run, longest


def personal_stats(db: Session, user: User) -> PersonalStats:
    captained = (
        db.query(func.count(RidePlan.id))
        .filter(RidePlan.captain_id == user.id)
        .scalar()
        or 0
    )
    joined = (
        db.query(func.count(RidePlanParticipant.id))
        .filter(
            RidePlanParticipant.user_id == user.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .scalar()
        or 0
    )

    # One pass over the rider's completed logs, carrying the derived distance
    # and the ride date, then folded in Python. The row count here is bounded
    # by how many rides one person has taken, so this is cheap; the
    # leaderboards aggregate in SQL because they span every rider.
    rows = (
        _completed_logs_query(db)
        .filter(RideLog.rider_id == user.id)
        .with_entities(
            RidePlan.planned_date.label("ride_date"),
            _round_trip_km().label("km"),
            Destination.id.label("destination_id"),
        )
        .all()
    )

    today = datetime.now(timezone.utc).date()
    week_start = _monday_of(today)
    month_start = today.replace(day=1)

    total = sum(float(r.km or 0.0) for r in rows)
    week_km = sum(float(r.km or 0.0) for r in rows if r.ride_date >= week_start)
    month_km = sum(float(r.km or 0.0) for r in rows if r.ride_date >= month_start)
    longest = max((float(r.km or 0.0) for r in rows), default=0.0)
    current, longest_streak = _streaks([r.ride_date for r in rows])

    return PersonalStats(
        rides_captained=captained,
        rides_joined=joined,
        rides_completed=len(rows),
        total_distance_km=round(total, 1),
        distance_this_week_km=round(week_km, 1),
        distance_this_month_km=round(month_km, 1),
        rides_this_week=sum(1 for r in rows if r.ride_date >= week_start),
        rides_this_month=sum(1 for r in rows if r.ride_date >= month_start),
        longest_ride_km=round(longest, 1),
        current_streak_weeks=current,
        longest_streak_weeks=longest_streak,
        destinations_visited=len({r.destination_id for r in rows}),
        has_home_location=(
            user.home_latitude is not None and user.home_longitude is not None
        ),
    )


# ---------------------------------------------------------------------------
# Single-ride distance (shared with the share-card summary)
# ---------------------------------------------------------------------------
def estimated_ride_km(
    home_lat: Optional[float],
    home_lon: Optional[float],
    dest_lat: float,
    dest_lon: float,
) -> float:
    """Round-trip estimate for one ride, in Python.

    The same home -> destination -> home derivation the leaderboards compute
    in SQL, for the single-row case where a query would be overkill. Both
    paths must agree, so this delegates to ``services.geo.haversine_km`` — the
    function the SQL expression above is a transcription of.

    Returns 0.0 when the rider has no home location, matching the SQL CASE.
    """
    if home_lat is None or home_lon is None:
        return 0.0
    return round(haversine_km(home_lat, home_lon, dest_lat, dest_lon) * 2, 1)
