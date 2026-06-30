def cache_key(ride_id: int, template_version: str) -> str:
    return f"share-cards/ride-{ride_id}/{template_version}"


def image_metadata() -> dict:
    return {"format": "png", "width": 1200, "height": 628}
