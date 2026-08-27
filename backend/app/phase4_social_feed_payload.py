def ride_summary(ride_id: int, destination: str, distance_km: float, duration_min: int) -> dict:
    return {
        "ride_id": ride_id,
        "destination": destination,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
    }


FEED_EVENT_TYPES = ("post", "like", "comment")
