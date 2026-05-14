REVIEW_FIELDS = ["destination_id", "rating", "title", "body", "visited_on"]
RIDE_LOG_FIELDS = ["ride_id", "distance_km", "duration_min", "photo_urls", "summary"]


def has_required_fields(payload: dict, required_fields: list[str]) -> bool:
    return all(field in payload and payload[field] not in (None, "") for field in required_fields)

