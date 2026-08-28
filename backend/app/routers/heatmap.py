"""GPS heatmaps — point-density data drawn from riders' recorded tracks.

Surface:
  GET /api/heatmap/users/{user_id}  — one rider's own covered ground
  GET /api/heatmap/global           — every rider's covered ground, with
                                       each rider's own privacy zone
                                       fuzzing applied per point (same
                                       rule GET /ride-logs/{id} uses for
                                       non-owner viewers)
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.ride_log import RideLog
from app.models.user import User
from app.schemas.heatmap import HeatmapResponse
from app.services.privacy import fuzz_track_near_home

router = APIRouter()

# A dense recorded track can be thousands of points; heatmaps only need
# density, not every sample, so each ride contributes a bounded subset.
MAX_POINTS_PER_RIDE = 60
MAX_TOTAL_POINTS = 6000


def _sample(track: list[dict], cap: int) -> list[dict]:
    if len(track) <= cap:
        return track
    step = max(1, len(track) // cap)
    return track[::step]


@router.get("/users/{user_id}", response_model=HeatmapResponse)
def user_heatmap(user_id: UUID, db: Session = Depends(get_db)) -> HeatmapResponse:
    if not db.query(User.id).filter(User.id == user_id).first():
        raise HTTPException(status_code=404, detail="User not found")

    logs = (
        db.query(RideLog.recorded_track)
        .filter(RideLog.rider_id == user_id, RideLog.recorded_track.isnot(None))
        .all()
    )
    points: list[list[float]] = []
    for (track,) in logs:
        for p in _sample(track, MAX_POINTS_PER_RIDE):
            if p.get("lat") is not None and p.get("lng") is not None:
                points.append([p["lat"], p["lng"]])
            if len(points) >= MAX_TOTAL_POINTS:
                break
        if len(points) >= MAX_TOTAL_POINTS:
            break
    return HeatmapResponse(points=points, ride_count=len(logs))


@router.get("/global", response_model=HeatmapResponse)
def global_heatmap(
    limit_rides: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
) -> HeatmapResponse:
    rows = (
        db.query(RideLog, User)
        .join(User, User.id == RideLog.rider_id)
        .filter(RideLog.recorded_track.isnot(None))
        .order_by(RideLog.created_at.desc())
        .limit(limit_rides)
        .all()
    )
    points: list[list[float]] = []
    for log, rider in rows:
        sampled = _sample(log.recorded_track, MAX_POINTS_PER_RIDE)
        fuzzed = fuzz_track_near_home(
            sampled,
            user_id=rider.id,
            home_lat=rider.home_latitude,
            home_lng=rider.home_longitude,
            privacy_zone_radius_km=rider.privacy_zone_radius_km,
        )
        for p in fuzzed:
            if p.get("lat") is not None and p.get("lng") is not None:
                points.append([p["lat"], p["lng"]])
            if len(points) >= MAX_TOTAL_POINTS:
                break
        if len(points) >= MAX_TOTAL_POINTS:
            break
    return HeatmapResponse(points=points, ride_count=len(rows))
