"""Per-user cost estimator for a destination ride.

Formula (round-trip):
    fuel_inr  = (2 * distance_km / bike_mileage_kmpl) * fuel_price_inr_per_l
    total_mid = fuel_inr + food_inr + entry_inr
    low/high  = total_mid ± 20%

Mileage may be None when the user has no bike record or is unauthenticated;
in that case fuel is reported as None and totals exclude it, with an
``assumptions`` note explaining the gap.
"""
from __future__ import annotations

from typing import Optional

from app.config import settings
from app.models.destination import Destination
from app.schemas.destination import CostEstimate


def estimate_cost(
    destination: Destination,
    distance_km: float,
    bike_mileage_kmpl: Optional[float],
    fuel_price_inr_per_l: Optional[float] = None,
) -> CostEstimate:
    fuel_price = fuel_price_inr_per_l or settings.FUEL_PRICE_INR_PER_L
    food = destination.estimated_food_cost or 0
    entry = destination.estimated_entry_cost or 0

    assumptions: dict[str, object] = {
        "round_trip": True,
        "fuel_price_inr_per_l": fuel_price,
        "buffer_pct": 20,
    }

    if bike_mileage_kmpl and bike_mileage_kmpl > 0:
        fuel_inr: Optional[int] = round(
            (2 * distance_km / bike_mileage_kmpl) * fuel_price
        )
        assumptions["bike_mileage_kmpl"] = bike_mileage_kmpl
    else:
        fuel_inr = None
        assumptions["fuel_excluded_reason"] = "missing bike mileage"

    total_mid = (fuel_inr or 0) + food + entry
    return CostEstimate(
        distance_km=round(distance_km, 1),
        fuel_inr=fuel_inr,
        food_inr=food,
        entry_inr=entry,
        total_inr_low=round(total_mid * 0.8),
        total_inr_high=round(total_mid * 1.2),
        currency=destination.currency,
        assumptions=assumptions,
    )
