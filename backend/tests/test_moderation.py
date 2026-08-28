from sqlalchemy import text

from tests.conftest import auth_headers, signup, test_engine


def _promote_to_admin(email: str) -> None:
    with test_engine.begin() as conn:
        conn.execute(
            text("UPDATE users SET is_admin = true WHERE email = :email"),
            {"email": email},
        )


def test_anyone_can_file_a_report(client):
    user = signup(client, "reporter@test.com", "Reporter")
    resp = client.post(
        "/api/moderation/reports",
        headers=auth_headers(user["access_token"]),
        json={
            "target_type": "user",
            "target_id": user["user"]["id"],
            "reason": "testing the report flow",
        },
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "open"
    assert body["reporter_id"] == user["user"]["id"]


def test_non_admin_forbidden_from_queue(client):
    user = signup(client, "notadmin@test.com", "Not Admin")
    resp = client.get(
        "/api/moderation/reports", headers=auth_headers(user["access_token"])
    )
    assert resp.status_code == 403

    resp = client.post(
        "/api/moderation/reports",
        headers=auth_headers(user["access_token"]),
        json={
            "target_type": "post",
            "target_id": user["user"]["id"],
            "reason": "spam",
        },
    )
    report_id = resp.json()["id"]

    resp = client.patch(
        f"/api/moderation/reports/{report_id}",
        headers=auth_headers(user["access_token"]),
        json={"status": "dismissed"},
    )
    assert resp.status_code == 403


def test_admin_can_list_and_update_reports(client):
    admin = signup(client, "admin@test.com", "Admin")
    _promote_to_admin("admin@test.com")
    reporter = signup(client, "reporter2@test.com", "Reporter Two")

    resp = client.post(
        "/api/moderation/reports",
        headers=auth_headers(reporter["access_token"]),
        json={
            "target_type": "chat_message",
            "target_id": reporter["user"]["id"],
            "reason": "abusive language",
        },
    )
    report_id = resp.json()["id"]

    resp = client.get(
        "/api/moderation/reports", headers=auth_headers(admin["access_token"])
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["reports"][0]["id"] == report_id

    resp = client.get(
        "/api/moderation/reports?status=open",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.json()["total"] == 1

    resp = client.get(
        "/api/moderation/reports?status=dismissed",
        headers=auth_headers(admin["access_token"]),
    )
    assert resp.json()["total"] == 0

    resp = client.patch(
        f"/api/moderation/reports/{report_id}",
        headers=auth_headers(admin["access_token"]),
        json={"status": "actioned"},
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["status"] == "actioned"
    assert updated["reviewed_by"] == admin["user"]["id"]
    assert updated["reviewed_at"] is not None
