"""Personal Records - longest ride, best month (by distance), and most
destinations visited in a single week. Computed at read-time from
RideLog rows (only ones with a real distance_km - manually-logged rides
with no GPS track don't count toward these, same as Strava's PRs only
coming from tracked activities).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.ride import RidePlan
from app.models.ride_log import RideLog


@dataclass(frozen=True)
class LongestRide:
    ride_log_id: UUID
    distance_km: float
    destination_name: Optional[str]
    ride_date: Optional[date]


@dataclass(frozen=True)
class BestMonth:
    year: int
    month: int
    total_distance_km: float
    ride_count: int


@dataclass(frozen=True)
class BestWeek:
    week_start: date
    destination_count: int


@dataclass(frozen=True)
class PersonalRecords:
    longest_ride: Optional[LongestRide]
    best_month: Optional[BestMonth]
    most_destinations_in_a_week: Optional[BestWeek]


def _ride_date(log: RideLog) -> Optional[date]:
    if log.actual_start_ts:
        return log.actual_start_ts.date()
    if log.ride_plan:
        return log.ride_plan.planned_date
    return None


def compute_personal_records(db: Session, user_id: UUID) -> PersonalRecords:
    logs = (
        db.query(RideLog)
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(RideLog.rider_id == user_id, RideLog.distance_km.isnot(None))
        .add_columns(RidePlan.destination_id, RidePlan.planned_date)
        .all()
    )
    if not logs:
        return PersonalRecords(longest_ride=None, best_month=None, most_destinations_in_a_week=None)

    longest: Optional[LongestRide] = None
    by_month: dict[tuple[int, int], list[float]] = {}
    by_week: dict[date, set] = {}

    # Destination names fetched separately (small N, avoids a join blow-up
    # on the aggregate query above).
    from app.models.destination import Destination  # local import - avoids a cycle at module load

    destination_ids = {destination_id for _log, destination_id, _planned_date in logs}
    dest_names = {
        d.id: d.name
        for d in db.query(Destination.id, Destination.name).filter(Destination.id.in_(destination_ids)).all()
    }

    for log, destination_id, planned_date in logs:
        d = _ride_date(log) or planned_date
        if d is None:
            continue

        if longest is None or (log.distance_km or 0) > longest.distance_km:
            longest = LongestRide(
                ride_log_id=log.id,
                distance_km=log.distance_km,
                destination_name=dest_names.get(destination_id),
                ride_date=d,
            )

        month_key = (d.year, d.month)
        by_month.setdefault(month_key, []).append(log.distance_km)

        week_start = d - timedelta(days=d.weekday())
        by_week.setdefault(week_start, set()).add(destination_id)

    best_month: Optional[BestMonth] = None
    if by_month:
        (year, month), distances = max(by_month.items(), key=lambda kv: sum(kv[1]))
        best_month = BestMonth(year=year, month=month, total_distance_km=round(sum(distances), 1), ride_count=len(distances))

    best_week: Optional[BestWeek] = None
    if by_week:
        week_start, dests = max(by_week.items(), key=lambda kv: len(kv[1]))
        best_week = BestWeek(week_start=week_start, destination_count=len(dests))

    return PersonalRecords(longest_ride=longest, best_month=best_month, most_destinations_in_a_week=best_week)
