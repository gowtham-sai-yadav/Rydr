"""Great-circle distance helpers — single source of truth for the M2 surface.

Both the in-Python and in-SQL helpers compute the **Haversine** distance so
the two paths agree to within float epsilon (relevant when the list query
filters by ``radius_km`` in SQL and the response re-emits ``distance_km`` in
Python — they must produce the same answer at the boundary).
"""
from __future__ import annotations

import math
from typing import Any

from sqlalchemy import Float, cast, func

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def haversine_sql_expression(
    origin_lat: float,
    origin_lng: float,
    lat_col: Any,
    lng_col: Any,
):
    """Return a SQLAlchemy expression for Haversine distance (km) between
    ``(origin_lat, origin_lng)`` and the row's ``(lat_col, lng_col)``.

    The formula matches :func:`haversine_km` exactly; ``a`` is mathematically
    in ``[0, 1]`` so no clamp is needed.
    """
    lat1 = func.radians(cast(origin_lat, Float))
    lng1 = func.radians(cast(origin_lng, Float))
    lat2 = func.radians(lat_col)
    lng2 = func.radians(lng_col)
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = (
        func.power(func.sin(dlat / 2), 2)
        + func.cos(lat1) * func.cos(lat2) * func.power(func.sin(dlng / 2), 2)
    )
    return 2 * EARTH_RADIUS_KM * func.asin(func.sqrt(a))
