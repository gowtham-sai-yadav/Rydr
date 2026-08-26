from datetime import date

from tests.conftest import auth_headers, create_and_complete_ride, create_destination, signup


def test_rider_leaderboard_ranks_by_ride_logs(client):
    rider = signup(client, "leader@test.com", "Leader")
    dest = create_destination(client, rider["access_token"])
    today = date.today().isoformat()
    ride_id = create_and_complete_ride(client, rider["access_token"], dest["id"], today)

    resp = client.post(
        "/api/ride-logs",
        headers=auth_headers(rider["access_token"]),
        json={"ride_plan_id": ride_id},
    )
    assert resp.status_code == 201, resp.text

    resp = client.get("/api/leaderboard/riders")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["rank"] == 1
    assert entries[0]["rides_logged"] == 1
    assert entries[0]["user"]["id"] == rider["user"]["id"]


def test_destination_leaderboard_counts_completed_rides_this_month(client):
    rider = signup(client, "leader2@test.com", "Leader")
    dest = create_destination(client, rider["access_token"], name="Popular Spot")
    today = date.today().isoformat()
    create_and_complete_ride(client, rider["access_token"], dest["id"], today)

    resp = client.get("/api/leaderboard/destinations")
    assert resp.status_code == 200
    entries = resp.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["destination_id"] == dest["id"]
    assert entries[0]["ride_count"] == 1
