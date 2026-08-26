from tests.conftest import auth_headers, create_destination, signup


def test_join_when_full_is_waitlisted(client):
    captain = signup(client, "wl-captain@test.com", "Captain")
    rider_a = signup(client, "wl-rider-a@test.com", "Rider A")
    rider_b = signup(client, "wl-rider-b@test.com", "Rider B")
    dest = create_destination(client, captain["access_token"])

    # max_riders=1: the captain's auto-approved seat already fills the ride.
    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain["access_token"]),
        json={
            "destination_id": dest["id"],
            "title": "Full ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 1,
        },
    )
    assert resp.status_code == 201
    ride_id = resp.json()["id"]

    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider_a["access_token"])
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "waitlisted"

    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider_b["access_token"])
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "waitlisted"


def test_join_below_capacity_is_pending(client):
    captain = signup(client, "wl-captain2@test.com", "Captain")
    rider = signup(client, "wl-rider2@test.com", "Rider")
    dest = create_destination(client, captain["access_token"])

    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain["access_token"]),
        json={
            "destination_id": dest["id"],
            "title": "Roomy ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 5,
        },
    )
    ride_id = resp.json()["id"]

    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
    )
    assert resp.status_code == 201
    assert resp.json()["status"] == "pending"


def test_captain_can_approve_waitlisted_participant(client):
    captain = signup(client, "wl-captain3@test.com", "Captain")
    rider_a = signup(client, "wl-rider3a@test.com", "Rider A")
    rider_b = signup(client, "wl-rider3b@test.com", "Rider B")
    dest = create_destination(client, captain["access_token"])

    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain["access_token"]),
        json={
            "destination_id": dest["id"],
            "title": "Full ride 2",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 2,
        },
    )
    ride_id = resp.json()["id"]

    # Captain (1 seat) + rider_a approved (2nd seat) fills the ride.
    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider_a["access_token"])
    )
    assert resp.json()["status"] == "pending"
    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_a['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 200

    # rider_b joins a now-full ride and lands waitlisted.
    resp = client.post(
        f"/api/rides/{ride_id}/join", headers=auth_headers(rider_b["access_token"])
    )
    assert resp.json()["status"] == "waitlisted"

    # rider_a leaves, freeing a seat. Captain can now approve the
    # waitlisted rider_b - same code path as approving a "pending"
    # participant, no schema change needed since the validator only
    # restricts the *target* status, not the participant's current one.
    resp = client.post(
        f"/api/rides/{ride_id}/leave", headers=auth_headers(rider_a["access_token"])
    )
    assert resp.status_code == 200

    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_b['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "approved"


def test_capacity_still_enforced_on_approval(client):
    captain = signup(client, "wl-captain4@test.com", "Captain")
    rider_a = signup(client, "wl-rider4a@test.com", "Rider A")
    rider_b = signup(client, "wl-rider4b@test.com", "Rider B")
    dest = create_destination(client, captain["access_token"])

    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain["access_token"]),
        json={
            "destination_id": dest["id"],
            "title": "Two seat ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 2,
        },
    )
    ride_id = resp.json()["id"]

    for rider in (rider_a, rider_b):
        resp = client.post(
            f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
        )
        assert resp.json()["status"] == "pending"

    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_a['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 200

    # Captain (auto-approved) + rider_a = 2 = max_riders. rider_b cannot
    # be approved even though they're still just "pending", not waitlisted
    # (they joined before the ride filled up).
    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_b['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 409
