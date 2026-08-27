def map_pin(lat: float, lng: float, label: str) -> dict:
    return {"lat": lat, "lng": lng, "label": label}


def route_preview(origin: tuple[float, float], destination: tuple[float, float]) -> dict:
    return {"origin": origin, "destination": destination, "provider": "mapbox-directions"}
