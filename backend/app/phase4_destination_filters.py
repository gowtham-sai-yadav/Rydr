from typing import TypedDict


class DestinationFilters(TypedDict, total=False):
    q: str
    max_distance_km: float
    vibes: list[str]
    cost_band: str
    vehicle_fit: list[str]


def normalize_filters(filters: DestinationFilters) -> DestinationFilters:
    return {key: value for key, value in filters.items() if value not in (None, "", [])}
