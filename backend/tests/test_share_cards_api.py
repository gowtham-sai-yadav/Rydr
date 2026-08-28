"""Share-card endpoints: caching, escaping, headers — Phase 4 W4."""
from __future__ import annotations

import datetime as dt
import uuid

import pytest

FUTURE = (dt.date.today() + dt.timedelta(days=10)).isoformat()


@pytest.fixture
def logged_ride(client, auth, make_user, make_destination):
    token, _, _ = make_user(
        "carder", home_city="Bangalore", home_latitude=12.9716, home_longitude=77.5946
    )
    dest = make_destination('Hostile <script>alert(1)</script> & Co')
    ride = client.post(
        "/api/rides",
        headers=auth(token),
        json={
            "destination_id": str(dest.id),
            "title": "Card ride",
            "planned_date": FUTURE,
            "planned_start_time": "06:00:00",
            "visibility": "group",
        },
    ).json()
    client.post(f"/api/rides/{ride['id']}/complete", headers=auth(token))
    log = client.post(
        "/api/ride-logs", headers=auth(token), json={"ride_plan_id": ride["id"]}
    ).json()
    return token, log["id"], dest


def test_card_renders_as_svg(client, logged_ride):
    _, log_id, _ = logged_ride
    res = client.get(f"/api/share-cards/rides/{log_id}.svg")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("image/svg+xml")
    assert res.text.startswith("<svg")


def test_card_is_public(client, logged_ride):
    """A shared card has to render for someone with no Rydr account."""
    _, log_id, _ = logged_ride
    assert client.get(f"/api/share-cards/rides/{log_id}.svg").status_code == 200


def test_hostile_destination_name_is_escaped(client, logged_ride):
    _, log_id, _ = logged_ride
    svg = client.get(f"/api/share-cards/rides/{log_id}.svg").text
    assert "<script>" not in svg


def test_download_filename_cannot_carry_header_injection(client, logged_ride):
    _, log_id, _ = logged_ride
    res = client.get(
        f"/api/share-cards/rides/{log_id}.svg", params={"download": True}
    )
    disposition = res.headers["content-disposition"]
    assert disposition.startswith("attachment;")
    filename = disposition.split("filename=")[1]
    for char in ('"', "<", ">", "\n", "\r", ";"):
        assert char not in filename.strip('"')


def test_conditional_request_returns_304_with_no_body(client, logged_ride):
    _, log_id, _ = logged_ride
    first = client.get(f"/api/share-cards/rides/{log_id}.svg")
    etag = first.headers["etag"]

    second = client.get(
        f"/api/share-cards/rides/{log_id}.svg", headers={"If-None-Match": etag}
    )
    assert second.status_code == 304
    assert second.content == b""


def test_etag_changes_when_the_ride_changes(client, auth, logged_ride):
    token, log_id, dest = logged_ride
    before = client.get(f"/api/share-cards/rides/{log_id}.svg").headers["etag"]

    client.post(
        f"/api/destinations/{dest.id}/ratings",
        headers=auth(token),
        json={"stars": 5, "ride_log_id": log_id},
    )

    after = client.get(f"/api/share-cards/rides/{log_id}.svg").headers["etag"]
    assert after != before


def test_cache_headers_allow_revalidation(client, logged_ride):
    _, log_id, _ = logged_ride
    cc = client.get(f"/api/share-cards/rides/{log_id}.svg").headers["cache-control"]
    assert "max-age" in cc
    # Ride details can be edited, so a long hard cache would serve a card
    # showing the wrong numbers for days.
    assert "stale-while-revalidate" in cc


def test_unknown_ride_log_is_404(client):
    assert (
        client.get(f"/api/share-cards/rides/{uuid.uuid4()}.svg").status_code == 404
    )


def test_summary_matches_the_leaderboard_distance(client, logged_ride):
    """The card, the summary and the leaderboard must not disagree about the
    same journey."""
    from app.services import stats

    _, log_id, dest = logged_ride
    summary = client.get(f"/api/ride-logs/{log_id}/summary").json()
    expected = stats.estimated_ride_km(
        12.9716, 77.5946, dest.latitude, dest.longitude
    )
    assert summary["estimated_distance_km"] == expected
