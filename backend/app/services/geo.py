"""Great-circle distance helpers — used by the M2 cost calculator.

The destinations list endpoint uses an inline SQL Haversine for filtering /
sorting so it can run in the database. This module is the in-Python twin used
when we already have a Destination object loaded (e.g. cost estimate).
"""
from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))
