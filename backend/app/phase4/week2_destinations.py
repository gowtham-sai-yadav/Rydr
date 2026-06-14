from typing import TypedDict


class DestinationFilterPayload(TypedDict, total=False):
    q: str
    distance_km: float
    vibe: list[str]
    cost_band: str
    vehicle_fit: list[str]


DESTINATION_FILTER_KEYS = ["q", "distance_km", "vibe", "cost_band", "vehicle_fit"]

