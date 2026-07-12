"""Relative Effort score - a 1-100 "how tough was this ride" number from
distance, moving duration, and terrain. No heart-rate sensor, no biometric
data - just the numbers a GPS track (or a manually-logged distance) already
gives us.

Formula, deliberately simple and explainable rather than "scientific":
  - base = min(60, distance_km / 2)              — longer rides are harder
  - pace_load = min(20, moving_hours * 4)         — more time in the saddle adds load
  - terrain_bonus = 0 / 8 / 15 (flat / mixed / hill or coastal)
  - clamp(base + pace_load + terrain_bonus, 1, 100)

A 50km flat ride in ~1.5h lands around 39. A 200km hill ride over 6h lands
at 100 (capped). Tuned so a typical weekend day-ride sits in the 30-60
range and only genuinely long/hard days hit the top end.
"""
from __future__ import annotations

from typing import Optional

TERRAIN_BONUS = {"flat": 0, "mixed": 8, "hill": 15, "coastal": 12}


def compute_relative_effort(
    distance_km: float,
    moving_duration_seconds: int,
    terrain_type: Optional[str] = None,
) -> int:
    base = min(60.0, distance_km / 2)
    moving_hours = moving_duration_seconds / 3600
    pace_load = min(20.0, moving_hours * 4)
    terrain_bonus = TERRAIN_BONUS.get(terrain_type or "", 5)  # unknown terrain: small default
    score = base + pace_load + terrain_bonus
    return max(1, min(100, round(score)))
