"""Maps, routing and geocoding — Phase 4 W2.

Every upstream call is mocked. These tests assert Rydr's behaviour around the
provider — coordinate order, fallbacks, caching, validation — not OSRM's or
Nominatim's correctness, and a suite that reached the public demo endpoints
would be slow, rate limited, and failing for reasons unrelated to this code.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

OSRM_OK = {
    "routes": [
        {
            "distance": 62400.0,
            "duration": 5400.0,
            # OSRM returns [lon, lat].
            "geometry": {"coordinates": [[77.5946, 12.9716], [77.6835, 13.3702]]},
        }
    ]
}

BLR = {"from_lat": 12.9716, "from_lng": 77.5946, "to_lat": 13.3702, "to_lng": 77.6835}


@pytest.fixture(autouse=True)
def _clear_route_cache():
    from app.services.maps import osm

    osm._cached_route.cache_clear()
    yield
    osm._cached_route.cache_clear()


def test_config_exposes_attribution_and_no_token(client):
    cfg = client.get("/api/maps/config").json()
    assert cfg["provider"] == "osm"
    # OSM attribution is a licence obligation, returned so a client cannot
    # ship without it.
    assert "OpenStreetMap" in cfg["attribution"]
    assert cfg["access_token"] is None


def test_route_flips_osrm_coordinates_to_lat_lon(client):
    with patch("app.services.maps.osm.get_json", return_value=OSRM_OK):
        body = client.get("/api/maps/route", params=BLR).json()

    assert body["distance_km"] == 62.4
    assert body["duration_minutes"] == 90
    assert body["is_estimate"] is False
    # Getting this backwards would put Indian routes in Somalia.
    assert body["geometry"][0] == [12.9716, 77.5946]


def test_router_outage_returns_a_flagged_estimate_with_no_geometry(client):
    with patch("app.services.maps.osm.get_json", return_value=None):
        body = client.get("/api/maps/route", params=BLR).json()

    assert body["is_estimate"] is True
    assert body["provider"] == "estimate"
    # No fabricated road: a straight line between two towns would show a
    # route that does not exist.
    assert body["geometry"] == []
    assert 50 < body["distance_km"] < 70


def test_malformed_router_response_falls_back_rather_than_erroring(client):
    with patch(
        "app.services.maps.osm.get_json", return_value={"routes": [{"junk": 1}]}
    ):
        res = client.get("/api/maps/route", params=BLR)

    assert res.status_code == 200
    assert res.json()["is_estimate"] is True


def test_routes_are_cached_including_nearby_origins(client):
    calls = {"n": 0}

    def _counting(*_a, **_k):
        calls["n"] += 1
        return OSRM_OK

    with patch("app.services.maps.osm.get_json", side_effect=_counting):
        client.get("/api/maps/route", params=BLR)
        client.get("/api/maps/route", params=BLR)
        # ~10m away: rounds to the same cache key.
        client.get(
            "/api/maps/route", params={**BLR, "from_lat": 12.97161, "from_lng": 77.59464}
        )

    assert calls["n"] == 1


def test_geocode_outage_returns_no_matches_not_an_error(client):
    with patch("app.services.maps.osm.get_json", return_value=None):
        res = client.get("/api/maps/geocode", params={"q": "Nandi Hills"})

    assert res.status_code == 200
    assert res.json()["results"] == []


def test_one_malformed_geocode_row_does_not_lose_the_others(client):
    payload = [
        {"display_name": "Nandi Hills", "lat": "13.37", "lon": "77.68", "type": "peak"},
        {"display_name": "broken", "lat": "not-a-number", "lon": "0"},
        {"display_name": "Nandi Cross", "lat": "13.30", "lon": "77.60"},
    ]
    with patch("app.services.maps.osm.get_json", return_value=payload):
        results = client.get("/api/maps/geocode", params={"q": "Nandi"}).json()["results"]

    assert len(results) == 2
    assert results[0]["latitude"] == 13.37


def test_pins_bounding_box_filters(client, make_destination):
    inside = make_destination("Inside", lat=13.0, lng=77.6)
    outside = make_destination("Outside", lat=28.6, lng=77.2)

    names = {
        p["name"]
        for p in client.get(
            "/api/maps/pins",
            params={"north": 13.5, "south": 12.5, "east": 78.0, "west": 77.0},
        ).json()["pins"]
    }
    assert inside.name in names
    assert outside.name not in names


def test_partial_bounding_box_is_rejected(client):
    """All four bounds or none. Ignoring half would return the whole world
    while looking like it had filtered."""
    res = client.get("/api/maps/pins", params={"north": 13.5, "south": 12.5})
    assert res.status_code == 422


def test_inverted_bounding_box_is_rejected(client):
    res = client.get(
        "/api/maps/pins",
        params={"north": 12.0, "south": 13.0, "east": 78.0, "west": 77.0},
    )
    assert res.status_code == 422


def test_truncation_is_reported(client, make_destination):
    make_destination("A", lat=13.0, lng=77.6)
    make_destination("B", lat=13.1, lng=77.6)

    body = client.get("/api/maps/pins", params={"limit": 1}).json()
    assert body["total"] == 1
    assert body["truncated"] is True


def test_provider_switches_on_token_without_a_code_change():
    from app.config import settings
    from app.services.maps import get_provider

    original = settings.MAPBOX_TOKEN
    try:
        settings.MAPBOX_TOKEN = "pk.test"
        provider = get_provider()
        assert provider.name == "mapbox"
        # Mapbox has a static image service; OSM does not.
        assert provider.static_image_url((13.37, 77.68)) is not None
    finally:
        settings.MAPBOX_TOKEN = original
    assert get_provider().name == "osm"
    assert get_provider().static_image_url((13.37, 77.68)) is None
