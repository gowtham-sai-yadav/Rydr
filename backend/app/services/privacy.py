"""Privacy zones - fuzz a GPS point that falls near a rider's home before
it's shown to anyone but the rider themselves, so a ride log's recorded
track (or, later, a heatmap) never gives away exactly where someone lives.

Deliberately not just "hide it" - fuzzing to a stable, deterministic
nearby offset keeps the point usable for a route map's general shape
without pinpointing a door. Stable per (user, point) so redrawing the
same log doesn't jitter the fuzzed point around on every request.
"""
from __future__ import annotations

import hashlib
import math
from typing import Optional
from uuid import UUID

EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _stable_unit_vector(seed: str) -> tuple[float, float]:
    """A deterministic pseudo-random direction from a string seed, via a
    hash rather than `random` - no seeding/state to manage, and the same
    (user_id, point) always fuzzes to the same offset."""
    digest = hashlib.sha256(seed.encode()).digest()
    angle = (int.from_bytes(digest[:4], "big") / 0xFFFFFFFF) * 2 * math.pi
    return math.cos(angle), math.sin(angle)


def fuzz_point_if_near_home(
    lat: float,
    lng: float,
    *,
    user_id: UUID,
    home_lat: Optional[float],
    home_lng: Optional[float],
    privacy_zone_radius_km: Optional[float],
) -> tuple[float, float]:
    """Returns (lat, lng) unchanged, or offset to the privacy zone's edge
    (in a stable pseudo-random direction) if the point falls inside it."""
    if not privacy_zone_radius_km or home_lat is None or home_lng is None:
        return lat, lng
    if _haversine_km(lat, lng, home_lat, home_lng) > privacy_zone_radius_km:
        return lat, lng

    dx, dy = _stable_unit_vector(f"{user_id}:{lat:.5f}:{lng:.5f}")
    # Push the point to just outside the zone radius, in that stable
    # direction - degrees-per-km approximation is fine at this radius.
    km_to_deg = privacy_zone_radius_km / 111.0
    return home_lat + dy * km_to_deg * 1.1, home_lng + dx * km_to_deg * 1.1


def fuzz_track_near_home(
    track: list[dict],
    *,
    user_id: UUID,
    home_lat: Optional[float],
    home_lng: Optional[float],
    privacy_zone_radius_km: Optional[float],
) -> list[dict]:
    if not privacy_zone_radius_km or home_lat is None or home_lng is None:
        return track
    fuzzed = []
    for p in track:
        lat, lng = fuzz_point_if_near_home(
            p.get("lat"), p.get("lng"),
            user_id=user_id, home_lat=home_lat, home_lng=home_lng,
            privacy_zone_radius_km=privacy_zone_radius_km,
        )
        fuzzed.append({**p, "lat": lat, "lng": lng})
    return fuzzed
