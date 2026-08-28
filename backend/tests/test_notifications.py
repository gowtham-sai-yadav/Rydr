"""Notification feed, delivery rules and triggers — Phase 4 W5."""
from __future__ import annotations

import datetime as dt

import pytest

FUTURE = (dt.date.today() + dt.timedelta(days=21)).isoformat()


def _types(client, auth, token):
    body = client.get("/api/notifications", headers=auth(token)).json()
    return [n["type"] for n in body["notifications"]]


def test_follow_notifies_once_even_on_repeat(client, auth, make_user):
    followee_token, followee_id, _ = make_user("followee")
    follower_token, _, _ = make_user("follower")

    client.post(f"/api/users/{followee_id}/follow", headers=auth(follower_token))
    client.post(f"/api/users/{followee_id}/follow", headers=auth(follower_token))

    assert _types(client, auth, followee_token).count("new_follower") == 1


def test_you_are_never_notified_of_your_own_action(client, auth, make_user):
    token, user_id, _ = make_user("solo")
    post_id = client.post(
        "/api/posts", headers=auth(token), json={"body": "mine"}
    ).json()["id"]
    client.post(f"/api/posts/{post_id}/like", headers=auth(token))

    assert "post_liked" not in _types(client, auth, token)


def test_ride_lifecycle_notifies_seated_riders(
    client, auth, make_user, make_destination
):
    captain_token, _, _ = make_user("cap")
    rider_token, rider_id, _ = make_user("rider")
    dest = make_destination("Lifecycle")

    ride = client.post(
        "/api/rides",
        headers=auth(captain_token),
        json={
            "destination_id": str(dest.id),
            "title": "Lifecycle ride",
            "planned_date": FUTURE,
            "planned_start_time": "07:00:00",
            "visibility": "group",
        },
    ).json()
    rid = ride["id"]

    client.post(f"/api/rides/{rid}/join", headers=auth(rider_token))
    assert "ride_join_requested" in _types(client, auth, captain_token)

    client.put(
        f"/api/rides/{rid}/participants/{rider_id}",
        headers=auth(captain_token),
        json={"status": "approved"},
    )
    assert "ride_join_approved" in _types(client, auth, rider_token)

    client.post(f"/api/rides/{rid}/start", headers=auth(captain_token))
    client.post(f"/api/rides/{rid}/complete", headers=auth(captain_token))
    kinds = _types(client, auth, rider_token)
    assert "ride_starting" in kinds
    assert "ride_completed" in kinds


def test_unread_count_and_mark_read(client, auth, make_user):
    reader_token, reader_id, _ = make_user("reader")
    actor_token, _, _ = make_user("actor")
    client.post(f"/api/users/{reader_id}/follow", headers=auth(actor_token))

    before = client.get(
        "/api/notifications/unread-count", headers=auth(reader_token)
    ).json()["unread"]
    assert before >= 1

    first = client.get("/api/notifications", headers=auth(reader_token)).json()[
        "notifications"
    ][0]["id"]
    client.post(f"/api/notifications/{first}/read", headers=auth(reader_token))
    after = client.get(
        "/api/notifications/unread-count", headers=auth(reader_token)
    ).json()["unread"]
    assert after == before - 1

    client.post("/api/notifications/read-all", headers=auth(reader_token))
    assert (
        client.get(
            "/api/notifications/unread-count", headers=auth(reader_token)
        ).json()["unread"]
        == 0
    )


def test_marking_read_is_idempotent(client, auth, make_user):
    reader_token, reader_id, _ = make_user("reader")
    actor_token, _, _ = make_user("actor")
    client.post(f"/api/users/{reader_id}/follow", headers=auth(actor_token))

    nid = client.get("/api/notifications", headers=auth(reader_token)).json()[
        "notifications"
    ][0]["id"]
    first = client.post(
        f"/api/notifications/{nid}/read", headers=auth(reader_token)
    ).json()["read_at"]
    second = client.post(
        f"/api/notifications/{nid}/read", headers=auth(reader_token)
    ).json()["read_at"]
    # The original "seen at" survives a double tap.
    assert first == second


def test_another_users_notification_is_a_404_not_a_403(
    client, auth, make_user
):
    """404, not 403 — a 403 would confirm the notification exists."""
    reader_token, reader_id, _ = make_user("reader")
    actor_token, _, _ = make_user("actor")
    stranger_token, _, _ = make_user("stranger")
    client.post(f"/api/users/{reader_id}/follow", headers=auth(actor_token))

    nid = client.get("/api/notifications", headers=auth(reader_token)).json()[
        "notifications"
    ][0]["id"]
    res = client.post(
        f"/api/notifications/{nid}/read", headers=auth(stranger_token)
    )
    assert res.status_code == 404


def test_unread_only_filter(client, auth, make_user):
    reader_token, reader_id, _ = make_user("reader")
    a_token, _, _ = make_user("a")
    b_token, _, _ = make_user("b")
    client.post(f"/api/users/{reader_id}/follow", headers=auth(a_token))
    client.post(f"/api/users/{reader_id}/follow", headers=auth(b_token))

    nid = client.get("/api/notifications", headers=auth(reader_token)).json()[
        "notifications"
    ][0]["id"]
    client.post(f"/api/notifications/{nid}/read", headers=auth(reader_token))

    unread = client.get(
        "/api/notifications",
        headers=auth(reader_token),
        params={"unread_only": True},
    ).json()
    assert all(n["read_at"] is None for n in unread["notifications"])
    assert nid not in [n["id"] for n in unread["notifications"]]
