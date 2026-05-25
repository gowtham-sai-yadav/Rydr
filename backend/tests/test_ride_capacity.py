from tests.conftest import auth_headers, create_destination, signup


def test_approve_beyond_max_riders_is_rejected(client):
    captain = signup(client, "captain@test.com", "Captain")
    rider_a = signup(client, "rider-a@test.com", "Rider A")
    rider_b = signup(client, "rider-b@test.com", "Rider B")

    dest = create_destination(client, captain["access_token"])

    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain["access_token"]),
        json={
            "destination_id": dest["id"],
            "title": "Small group ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 2,
        },
    )
    assert resp.status_code == 201
    ride_id = resp.json()["id"]

    for rider in (rider_a, rider_b):
        resp = client.post(
            f"/api/rides/{ride_id}/join", headers=auth_headers(rider["access_token"])
        )
        assert resp.status_code == 201

    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_a['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 200

    resp = client.put(
        f"/api/rides/{ride_id}/participants/{rider_b['user']['id']}",
        headers=auth_headers(captain["access_token"]),
        json={"status": "approved"},
    )
    assert resp.status_code == 409
    assert "capacity" in resp.json()["detail"].lower()
