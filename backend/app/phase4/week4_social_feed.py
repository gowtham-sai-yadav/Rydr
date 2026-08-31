SOCIAL_FEED_EVENT_TYPES = ("post", "like", "comment")


def ride_summary_payload(ride_id: int, distance_km: float, duration_min: int, destination: str) -> dict:
    return {
        "ride_id": ride_id,
        "distance_km": round(distance_km, 2),
        "duration_min": duration_min,
        "destination": destination,
    }

