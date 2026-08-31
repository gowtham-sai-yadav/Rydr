"""Turns a raw recorded GPS track into ride-log stats: distance, moving
duration (auto-pause aware), average speed, elevation gain, and a terrain
guess. One function, called from ride_logs.py whenever a ride log is
saved with a `recorded_track` - this is what makes "auto ride recording"
real instead of just fields sitting empty in the schema.

Track shape: list of {"lat": float, "lng": float, "ts": ISO8601 string,
"speed_kmh": float | None}, in chronological order - exactly what
LiveRideMap.tsx accumulates client-side and what the ride-log form
submits on completion.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import httpx

EARTH_RADIUS_KM = 6371.0
# A gap between consecutive points with near-zero movement for at least
# this long counts as a stop (fuel/food/photo break) and is excluded from
# moving_duration_seconds - this IS the auto-pause detection feature.
PAUSE_SPEED_THRESHOLD_KMH = 3.0
PAUSE_MIN_GAP_SECONDS = 90

OPEN_ELEVATION_URL = "https://api.open-elevation.com/api/v1/lookup"
# Elevation lookups are a nice-to-have, not a hard dependency - a slow or
# down third-party API should never fail a ride-log save.
ELEVATION_TIMEOUT_SECONDS = 6.0
# Sending every GPS point to Open-Elevation would be slow and wasteful;
# a few dozen evenly-spaced samples is enough to estimate total climb.
MAX_ELEVATION_SAMPLES = 40


@dataclass(frozen=True)
class TrackStats:
    distance_km: float
    moving_duration_seconds: int
    avg_speed_kmh: Optional[float]
    elevation_gain_m: Optional[float]
    terrain_type: Optional[str]


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat1, lng1 = math.radians(a[0]), math.radians(a[1])
    lat2, lng2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(h))


def _parse_ts(raw) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except ValueError:
        return None


def _fetch_elevation_gain(points: list[tuple[float, float]]) -> Optional[float]:
    """Total climb across a sampled subset of the track. Returns None
    (never 0) on any failure so the caller can tell "no data" apart from
    "genuinely flat" - a flat total is a real, meaningful zero."""
    if len(points) < 2:
        return None
    step = max(1, len(points) // MAX_ELEVATION_SAMPLES)
    sampled = points[::step]
    locations = [{"latitude": lat, "longitude": lng} for lat, lng in sampled]
    try:
        resp = httpx.post(
            OPEN_ELEVATION_URL, json={"locations": locations}, timeout=ELEVATION_TIMEOUT_SECONDS
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        elevations = [r["elevation"] for r in results if "elevation" in r]
        if len(elevations) < 2:
            return None
        gain = sum(max(0.0, elevations[i] - elevations[i - 1]) for i in range(1, len(elevations)))
        return round(gain, 1)
    except Exception:  # noqa: BLE001 - third-party API, never fail the save over it
        return None


def fetch_elevations(points: list[tuple[float, float]]) -> Optional[list[float]]:
    """Per-point elevations (not just total gain) for a small point set —
    used for a route's elevation profile, where every point matters
    (unlike a dense recorded track, which only needs the aggregate).
    None on any failure, same never-block-the-caller contract as
    ``_fetch_elevation_gain``."""
    if not points:
        return None
    locations = [{"latitude": lat, "longitude": lng} for lat, lng in points]
    try:
        resp = httpx.post(
            OPEN_ELEVATION_URL, json={"locations": locations}, timeout=ELEVATION_TIMEOUT_SECONDS
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        elevations = [r["elevation"] for r in results if "elevation" in r]
        return elevations if len(elevations) == len(points) else None
    except Exception:  # noqa: BLE001 - third-party API, never fail the request over it
        return None


def _guess_terrain(elevation_gain_m: Optional[float], distance_km: float, destination_tags: set[str]) -> Optional[str]:
    """Cheap heuristic, not a model: destination tags are the strongest
    signal when present (a ride tagged "coastal" almost certainly is),
    falling back to elevation-gain-per-km when tags don't say."""
    if "coastal" in destination_tags or "beach" in destination_tags:
        return "coastal"
    if "mountain" in destination_tags or "waterfall" in destination_tags:
        return "hill"
    if elevation_gain_m is None or distance_km <= 0:
        return None
    gain_per_km = elevation_gain_m / distance_km
    if gain_per_km >= 15:
        return "hill"
    if gain_per_km <= 3:
        return "flat"
    return "mixed"


def analyze_track(
    track: list[dict],
    *,
    destination_tags: Optional[set[str]] = None,
    fetch_elevation: bool = True,
) -> Optional[TrackStats]:
    """Returns None for a track too short to say anything meaningful about
    (0 or 1 points) rather than fabricating zeros."""
    if not track or len(track) < 2:
        return None

    points: list[tuple[float, float]] = []
    timestamps: list[Optional[datetime]] = []
    for p in track:
        lat, lng = p.get("lat"), p.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            continue
        points.append((lat, lng))
        timestamps.append(_parse_ts(p.get("ts")))

    if len(points) < 2:
        return None

    distance_km = 0.0
    moving_seconds = 0
    for i in range(1, len(points)):
        seg_km = _haversine_km(points[i - 1], points[i])
        distance_km += seg_km

        t0, t1 = timestamps[i - 1], timestamps[i]
        if t0 is None or t1 is None:
            continue
        seg_seconds = (t1 - t0).total_seconds()
        if seg_seconds <= 0:
            continue
        seg_speed_kmh = seg_km / (seg_seconds / 3600) if seg_seconds > 0 else 0

        # Auto-pause: a long, near-stationary gap doesn't count as riding
        # time. A short slow segment (traffic, a hairpin) still counts.
        if seg_speed_kmh < PAUSE_SPEED_THRESHOLD_KMH and seg_seconds >= PAUSE_MIN_GAP_SECONDS:
            continue
        moving_seconds += int(seg_seconds)

    avg_speed_kmh = (distance_km / (moving_seconds / 3600)) if moving_seconds > 0 else None

    elevation_gain_m = _fetch_elevation_gain(points) if fetch_elevation else None
    terrain_type = _guess_terrain(elevation_gain_m, distance_km, destination_tags or set())

    return TrackStats(
        distance_km=round(distance_km, 2),
        moving_duration_seconds=moving_seconds,
        avg_speed_kmh=round(avg_speed_kmh, 1) if avg_speed_kmh else None,
        elevation_gain_m=elevation_gain_m,
        terrain_type=terrain_type,
    )
