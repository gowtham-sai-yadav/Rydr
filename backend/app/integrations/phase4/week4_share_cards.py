def share_card_key(ride_id: int, template_version: str) -> str:
    return f"share-cards/ride-{ride_id}/{template_version}"


def share_card_meta(width: int = 1200, height: int = 628) -> dict:
    return {"width": width, "height": height, "format": "png"}

