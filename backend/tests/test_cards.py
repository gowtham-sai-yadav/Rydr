import uuid

from app.models.badge import Badge, UserBadge
from tests.conftest import (
    auth_headers,
    create_and_complete_ride,
    create_destination,
    signup,
)


def test_ride_log_summary_and_card(client):
    rider = signup(client, "card-rider@test.com", "Card Rider")
    dest = create_destination(client, rider["access_token"], name="Card Destination")
    ride_id = create_and_complete_ride(
        client, rider["access_token"], dest["id"], "2099-01-01"
    )

    resp = client.post(
        "/api/ride-logs",
        headers=auth_headers(rider["access_token"]),
        json={"ride_plan_id": ride_id},
    )
    assert resp.status_code == 201, resp.text
    log_id = resp.json()["id"]

    resp = client.get(f"/api/ride-logs/{log_id}/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ride_log_id"] == log_id
    assert body["rider_name"] == "Card Rider"
    assert body["destination_name"] == dest["name"]
    assert "estimated_distance_km" in body
    assert "duration_minutes" in body
    assert "ride_date" in body
    assert "photo_count" in body

    resp = client.get(f"/api/ride-logs/{log_id}/card")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert len(resp.content) > 500


def test_badge_card(client, db):
    rider = signup(client, "card-rider2@test.com", "Badge Rider")

    # Badge catalog rows are seeded by a standalone script (scripts/seed_badges.py),
    # not by migrations or the app itself, so tests create their own catalog
    # row + award directly rather than depending on that script having run.
    # Uses the `db` fixture rather than a standalone session so the write is
    # visible inside the same test transaction `client` reads through.
    badge = Badge(
        slug=f"test-badge-{uuid.uuid4().hex[:8]}",
        name="Test Trailblazer",
        description="Awarded for testing purposes",
    )
    db.add(badge)
    db.flush()
    award = UserBadge(user_id=rider["user"]["id"], badge_id=badge.id)
    db.add(award)
    db.flush()
    award_id = str(award.id)

    resp = client.get(f"/api/badges/{award_id}/card")
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "image/png"
    assert len(resp.content) > 500
