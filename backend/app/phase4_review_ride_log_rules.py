REVIEW_RATINGS = range(1, 6)
REQUIRED_RIDE_LOG_FIELDS = ("ride_id", "distance_km", "duration_min")


def valid_rating(value: int) -> bool:
    return value in REVIEW_RATINGS


def ride_log_ready(payload: dict) -> bool:
    return all(payload.get(field) is not None for field in REQUIRED_RIDE_LOG_FIELDS)
