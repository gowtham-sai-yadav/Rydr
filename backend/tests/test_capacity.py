"""Ride capacity and the waitlist — Phase 4 W6."""
from __future__ import annotations

import datetime as dt

import pytest

FUTURE = (dt.date.today() + dt.timedelta(days=14)).isoformat()


@pytest.fixture
def ride(client, auth, make_user, make_destination):
    captain_token, captain_id, _ = make_user("captain")
    dest = make_destination("Cap")
    res = client.post(
        "/api/rides",
        headers=auth(captain_token),
        json={
            "destination_id": str(dest.id),
            "title": "Capacity ride",
            "planned_date": FUTURE,
            "planned_start_time": "07:00:00",
            "visibility": "group",
            "max_riders": 2,
        },
    )
    assert res.status_code == 201, res.text
    return res.json(), captain_token, captain_id


def _join_and(client, auth, ride_id, captain_token, token, user_id, status):
    client.post(f"/api/rides/{ride_id}/join", headers=auth(token))
    return client.put(
        f"/api/rides/{ride_id}/participants/{user_id}",
        headers=auth(captain_token),
        json={"status": status},
    )


def test_captain_occupies_a_seat(ride):
    """max_riders counts the captain, who is auto-joined as approved."""
    detail, _, _ = ride
    assert detail["max_riders"] == 2
    assert detail["participant_count"] == 1
    assert detail["seats_available"] == 1


def test_approving_into_a_full_ride_is_rejected(client, auth, make_user, ride):
    detail, captain_token, _ = ride
    first_token, first_id, _ = make_user("first")
    second_token, second_id, _ = make_user("second")

    ok = _join_and(client, auth, detail["id"], captain_token, first_token, first_id, "approved")
    assert ok.status_code == 200

    full = _join_and(client, auth, detail["id"], captain_token, second_token, second_id, "approved")
    assert full.status_code == 409
    # The message has to say what to do next, not just that it failed.
    assert "capacity" in full.json()["detail"].lower()
    assert "waitlisted" in full.json()["detail"]


def test_waitlisted_rider_is_promoted_when_a_seat_frees(
    client, auth, make_user, ride
):
    detail, captain_token, _ = ride
    ride_id = detail["id"]
    first_token, first_id, _ = make_user("first")
    second_token, second_id, _ = make_user("second")

    _join_and(client, auth, ride_id, captain_token, first_token, first_id, "approved")
    queued = _join_and(
        client, auth, ride_id, captain_token, second_token, second_id, "waitlisted"
    )
    assert queued.json()["status"] == "waitlisted"
    assert client.get(f"/api/rides/{ride_id}").json()["waitlist_count"] == 1

    client.post(f"/api/rides/{ride_id}/leave", headers=auth(first_token))

    after = client.get(f"/api/rides/{ride_id}").json()
    assert after["waitlist_count"] == 0
    assert after["seats_available"] == 0
    participants = client.get(f"/api/rides/{ride_id}/participants").json()["participants"]
    promoted = next(p for p in participants if p["user_id"] == second_id)
    assert promoted["status"] == "approved"


def test_raising_max_riders_drains_the_waitlist(client, auth, make_user, ride):
    detail, captain_token, _ = ride
    ride_id = detail["id"]
    a_token, a_id, _ = make_user("a")
    b_token, b_id, _ = make_user("b")

    _join_and(client, auth, ride_id, captain_token, a_token, a_id, "approved")
    _join_and(client, auth, ride_id, captain_token, b_token, b_id, "waitlisted")
    assert client.get(f"/api/rides/{ride_id}").json()["waitlist_count"] == 1

    client.put(f"/api/rides/{ride_id}", headers=auth(captain_token), json={"max_riders": 5})

    after = client.get(f"/api/rides/{ride_id}").json()
    assert after["waitlist_count"] == 0
    assert after["participant_count"] == 3


def test_max_riders_cannot_drop_below_approved_count(
    client, auth, make_user, ride
):
    detail, captain_token, _ = ride
    ride_id = detail["id"]
    a_token, a_id, _ = make_user("a")
    _join_and(client, auth, ride_id, captain_token, a_token, a_id, "approved")

    res = client.put(
        f"/api/rides/{ride_id}", headers=auth(captain_token), json={"max_riders": 1}
    )
    assert res.status_code == 409
    assert "already approved" in res.json()["detail"]
