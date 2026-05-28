"""Per-user cost estimator for a destination ride.

Formula (round-trip):
    fuel  = (2 * distance_km / bike_mileage_kmpl) * fuel_price_inr_per_l
    total = fuel + food + entry
    low   = total * 0.80
    high  = total * 1.20

If mileage is missing (no bike record / no auth) we DO NOT silently zero out
fuel and apply the buffer to food+entry alone — that produces ranges off by an
order of magnitude. Instead ``fuel`` and ``total_low/high`` come back as
``None`` and ``fuel_included`` is False so the UI can prompt for bike data.
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
        fuel: Optional[int] = round(
            (2 * distance_km / bike_mileage_kmpl) * fuel_price
        )
        assumptions["bike_mileage_kmpl"] = bike_mileage_kmpl
        total_mid = fuel + food + entry
        total_low: Optional[int] = round(total_mid * 0.8)
        total_high: Optional[int] = round(total_mid * 1.2)
        fuel_included = True
    else:
        fuel = None
        total_low = None
        total_high = None
        fuel_included = False
        assumptions["fuel_excluded_reason"] = "missing bike mileage"

    return CostEstimate(
        distance_km=round(distance_km, 1),
        fuel=fuel,
        food=food,
        entry=entry,
        total_low=total_low,
        total_high=total_high,
        currency=destination.currency,
        fuel_included=fuel_included,
        assumptions=assumptions,
    )
