from tests.conftest import auth_headers, create_destination, signup


def _make_ride(client, captain_token, dest_id, max_riders=10):
    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain_token),
        json={
            "destination_id": dest_id,
            "title": "Notif test ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": max_riders,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_join_request_notifies_captain(client):
    captain = signup(client, "captain-notif@test.com", "Captain")
    rider = signup(client, "rider-notif@test.com", "Rider")
    dest = create_destination(client, captain["access_token"])
    ride_id = _make_ride(client, captain["access_token"], dest["id"])

    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
    )
    assert resp.status_code == 201

    resp = client.get(
        "/api/notifications", headers=auth_headers(captain["access_token"])
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["unread_count"] == 1
    note = body["notifications"][0]
    assert note["type"] == "ride_join_requested"
    assert note["read_at"] is None

    # Re-requesting while still pending is idempotent — no duplicate notification.
    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
    )
    assert resp.status_code == 201
    resp = client.get(
        "/api/notifications", headers=auth_headers(captain["access_token"])
    )
    assert resp.json()["total"] == 1


def test_approval_notifies_participant(client):
    captain = signup(client, "captain-notif2@test.com", "Captain")
    rider = signup(client, "rider-notif2@test.com", "Rider")
    dest = create_destination(client, captain["access_token"])
    ride_id = _make_ride(client, captain["access_token"], dest["id"])

    client.post(f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"]))

    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 200

    resp = client.get(
        "/api/notifications", headers=auth_headers(rider["access_token"])
    )
    assert resp.status_code == 200
    notes = resp.json()["notifications"]
    assert any(n["type"] == "ride_join_approved" for n in notes)


def test_list_pagination(client):
    captain = signup(client, "captain-notif3@test.com", "Captain")
    dest = create_destination(client, captain["access_token"])

    # Three separate rides, each joined by a distinct rider, generates
    # three ride_join_requested notifications for the captain.
    for i in range(3):
        rider = signup(client, f"rider-notif3-{i}@test.com", f"Rider {i}")
        ride_id = _make_ride(client, captain["access_token"], dest["id"], max_riders=10)
        resp = client.post(
            f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
        )
        assert resp.status_code == 201

    resp = client.get(
        "/api/notifications?page=1&limit=2",
        headers=auth_headers(captain["access_token"]),
    )
    body = resp.json()
    assert body["total"] == 3
    assert len(body["notifications"]) == 2
    assert body["unread_count"] == 3

    resp = client.get(
        "/api/notifications?page=2&limit=2",
        headers=auth_headers(captain["access_token"]),
    )
    assert len(resp.json()["notifications"]) == 1


def test_mark_one_read(client):
    captain = signup(client, "captain-notif4@test.com", "Captain")
    rider = signup(client, "rider-notif4@test.com", "Rider")
    dest = create_destination(client, captain["access_token"])
    ride_id = _make_ride(client, captain["access_token"], dest["id"])
    client.post(f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"]))

    resp = client.get("/api/notifications", headers=auth_headers(captain["access_token"]))
    note_id = resp.json()["notifications"][0]["id"]

    resp = client.post(
        f"/api/notifications/{note_id}/read",
        headers=auth_headers(captain["access_token"]),
    )
    assert resp.status_code == 200
    assert resp.json()["read_at"] is not None

    resp = client.get("/api/notifications", headers=auth_headers(captain["access_token"]))
    assert resp.json()["unread_count"] == 0

    # Reading someone else's (or a nonexistent) notification 404s.
    resp = client.post(
        f"/api/notifications/{note_id}/read",
        headers=auth_headers(rider["access_token"]),
    )
    assert resp.status_code == 404


def test_mark_all_read(client):
    captain = signup(client, "captain-notif5@test.com", "Captain")
    dest = create_destination(client, captain["access_token"])

    for i in range(2):
        rider = signup(client, f"rider-notif5-{i}@test.com", f"Rider {i}")
        ride_id = _make_ride(client, captain["access_token"], dest["id"])
        client.post(f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"]))

    resp = client.post(
        "/api/notifications/read-all", headers=auth_headers(captain["access_token"])
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 2

    resp = client.get("/api/notifications", headers=auth_headers(captain["access_token"]))
    assert resp.json()["unread_count"] == 0
