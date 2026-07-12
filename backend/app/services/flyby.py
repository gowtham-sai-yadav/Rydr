"""Flyby — other riders whose recorded GPS track came close to yours
around the same time, even on an unrelated ride (different destination,
different group). No PostGIS in this stack, so this is a cheap two-stage
filter rather than a spatial index query:

  1. Narrow candidates to ride logs (different rider) whose time window
     overlaps within FLYBY_TIME_BUFFER_MINUTES and whose track's bounding
     box is within FLYBY_DISTANCE_KM of the target track's bounding box.
  2. For surviving candidates, sample both tracks down to a small point
     count and check every pair for the closest approach — cheap once
     the candidate set is small, which the stage-1 filter guarantees.

Good enough at this app's scale (dozens-to-hundreds of tracked rides, not
millions); would need a real spatial index long before this stage-1
filter became the bottleneck.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.models.ride_log import RideLog
from app.models.user import User
from app.services.geo import haversine_km

FLYBY_DISTANCE_KM = 0.5
FLYBY_TIME_BUFFER_MINUTES = 20
SAMPLE_SIZE = 40


@dataclass(frozen=True)
class FlybyMatch:
    rider: User
    other_ride_log_id: UUID
    closest_distance_km: float
    approx_time: Optional[datetime]


def _sample(track: list[dict], cap: int) -> list[dict]:
    if len(track) <= cap:
        return track
    step = max(1, len(track) // cap)
    return track[::step]


def _bbox(track: list[dict]) -> Optional[tuple[float, float, float, float]]:
    lats = [p["lat"] for p in track if p.get("lat") is not None]
    lngs = [p["lng"] for p in track if p.get("lng") is not None]
    if not lats or not lngs:
        return None
    return min(lats), max(lats), min(lngs), max(lngs)


def find_flybys(db: Session, target: RideLog, limit: int = 10) -> list[FlybyMatch]:
    if not target.recorded_track or not target.actual_start_ts:
        return []

    bbox = _bbox(target.recorded_track)
    if bbox is None:
        return []
    min_lat, max_lat, min_lng, max_lng = bbox
    # ~1 degree latitude is ~111km; pad the bbox by the flyby radius plus
    # slack so nothing near the edge gets excluded by stage 1.
    pad = (FLYBY_DISTANCE_KM / 111.0) * 2
    window_start = target.actual_start_ts - timedelta(minutes=FLYBY_TIME_BUFFER_MINUTES)
    window_end = (target.actual_end_ts or target.actual_start_ts) + timedelta(minutes=FLYBY_TIME_BUFFER_MINUTES)

    candidates = (
        db.query(RideLog)
        .options(selectinload(RideLog.rider))
        .filter(
            RideLog.id != target.id,
            RideLog.rider_id != target.rider_id,
            RideLog.recorded_track.isnot(None),
            RideLog.actual_start_ts.isnot(None),
            RideLog.actual_start_ts <= window_end,
            or_(RideLog.actual_end_ts.is_(None), RideLog.actual_end_ts >= window_start),
        )
        .limit(200)  # hard cap on stage-1 candidates before the point-pair check
        .all()
    )

    target_sample = _sample(target.recorded_track, SAMPLE_SIZE)
    matches: list[FlybyMatch] = []

    for candidate in candidates:
        cbbox = _bbox(candidate.recorded_track)
        if cbbox is None:
            continue
        c_min_lat, c_max_lat, c_min_lng, c_max_lng = cbbox
        # Stage-1 bbox overlap check (with padding) — skip anything whose
        # tracks couldn't possibly come within FLYBY_DISTANCE_KM.
        if c_max_lat < min_lat - pad or c_min_lat > max_lat + pad:
            continue
        if c_max_lng < min_lng - pad or c_min_lng > max_lng + pad:
            continue

        candidate_sample = _sample(candidate.recorded_track, SAMPLE_SIZE)
        best_distance = None
        best_point = None
        for tp in target_sample:
            if tp.get("lat") is None:
                continue
            for cp in candidate_sample:
                if cp.get("lat") is None:
                    continue
                d = haversine_km(tp["lat"], tp["lng"], cp["lat"], cp["lng"])
                if best_distance is None or d < best_distance:
                    best_distance = d
                    best_point = tp

        if best_distance is not None and best_distance <= FLYBY_DISTANCE_KM:
            matches.append(
                FlybyMatch(
                    rider=candidate.rider,
                    other_ride_log_id=candidate.id,
                    closest_distance_km=round(best_distance, 2),
                    approx_time=_parse_point_ts(best_point) if best_point else None,
                )
            )

    matches.sort(key=lambda m: m.closest_distance_km)
    return matches[:limit]


def _parse_point_ts(point: dict) -> Optional[datetime]:
    raw = point.get("ts")
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None
