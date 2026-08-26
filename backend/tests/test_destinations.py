"""Tests for GET /api/destinations - filtering, search, and the city-alias
expansion added so riders can search by nearest-city abbreviation (e.g.
"blr" for Bangalore) instead of only literal name/region substrings.
"""
from __future__ import annotations

from app.models.destination import Destination, TerrainDifficulty


def _make_destination(
    db_session,
    name: str,
    region: str,
    description: str,
    lat: float = 12.9716,
    lng: float = 77.5946,
) -> Destination:
    dest = Destination(
        name=name,
        description=description,
        region=region,
        country="India",
        currency="INR",
        latitude=lat,
        longitude=lng,
        terrain_difficulty=TerrainDifficulty.moderate,
    )
    db_session.add(dest)
    db_session.commit()
    return dest


def test_literal_substring_search_still_works(client, db_session):
    _make_destination(
        db_session,
        "Nandi Hills",
        "Karnataka",
        "Classic weekend sunrise ride near Bangalore.",
    )
    _make_destination(
        db_session,
        "Mahabaleshwar",
        "Maharashtra",
        "Strawberry-country hill station out of Pune.",
    )

    resp = client.get("/api/destinations", params={"q": "Nandi"})
    assert resp.status_code == 200
    body = resp.json()
    names = [d["name"] for d in body["destinations"]]
    assert "Nandi Hills" in names
    assert "Mahabaleshwar" not in names


def test_region_substring_search_still_works(client, db_session):
    _make_destination(
        db_session,
        "Chikmagalur",
        "Karnataka",
        "Coffee country hill station under 250km from Bangalore.",
    )

    resp = client.get("/api/destinations", params={"q": "Karnataka"})
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()["destinations"]]
    assert "Chikmagalur" in names


def test_city_alias_search_finds_bangalore_area_destinations(client, db_session):
    """The reported bug: typing "blr" found nothing, because search only
    matched literal name/region substrings and region is state-level
    ("Karnataka") rather than city-level. The description text carries the
    nearest-city name, so the alias expansion should surface it."""
    _make_destination(
        db_session,
        "Skandagiri",
        "Karnataka",
        "Night-trek-and-ride favourite an hour north of Bangalore.",
    )
    _make_destination(
        db_session,
        "Mahabaleshwar",
        "Maharashtra",
        "Strawberry-country hill station out of Pune.",
        lat=17.9307,
        lng=73.6477,
    )

    resp = client.get("/api/destinations", params={"q": "blr"})
    assert resp.status_code == 200
    body = resp.json()
    names = [d["name"] for d in body["destinations"]]
    assert "Skandagiri" in names
    assert "Mahabaleshwar" not in names


def test_city_alias_search_is_case_insensitive(client, db_session):
    _make_destination(
        db_session,
        "Warangal Fort",
        "Telangana",
        "Kakatiya-era fort ride from Hyderabad.",
        lat=17.9689,
        lng=79.5941,
    )

    resp = client.get("/api/destinations", params={"q": "HYD"})
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()["destinations"]]
    assert "Warangal Fort" in names


def test_unmapped_query_falls_back_to_plain_substring(client, db_session):
    dest = _make_destination(
        db_session,
        "Zambezi Bend",
        "Karnataka",
        "Fictional fixture destination used only by this test.",
    )

    # Not an alias key and not a substring of the fixture's name/region/
    # description - should behave like any other no-match search, not
    # error out or accidentally match via the alias path.
    resp = client.get("/api/destinations", params={"q": "notarealcityabbrev"})
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()["destinations"]]
    assert dest.name not in names

    # A real substring of the fixture still matches, confirming the alias
    # logic is additive and didn't break the plain path.
    resp = client.get("/api/destinations", params={"q": "Zambezi"})
    assert resp.status_code == 200
    names = [d["name"] for d in resp.json()["destinations"]]
    assert dest.name in names


def test_unknown_tag_slug_returns_400(client):
    resp = client.get("/api/destinations", params={"tags": ["not-a-real-tag"]})
    assert resp.status_code == 400
