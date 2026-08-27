"""Content reporting and the admin queue — Phase 4 W7."""
from __future__ import annotations

import uuid

import pytest


@pytest.fixture
def admin(client, auth, make_user, db):
    """A rider promoted to admin, the way grant_admin.py does it."""
    from app.models.user import User

    token, user_id, _ = make_user("admin")
    db.query(User).filter(User.id == user_id).update({User.is_admin: True})
    db.flush()
    return token, user_id


def test_reporting_the_same_content_twice_amends_rather_than_duplicates(
    client, auth, make_user
):
    author_token, _, _ = make_user("author")
    reporter_token, _, _ = make_user("reporter")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "spam"}
    ).json()["id"]

    first = client.post(
        "/api/reports",
        headers=auth(reporter_token),
        json={"content_type": "post", "content_id": pid, "reason": "spam"},
    )
    assert first.status_code == 201

    client.post(
        "/api/reports",
        headers=auth(reporter_token),
        json={"content_type": "post", "content_id": pid, "reason": "harassment"},
    )

    mine = client.get("/api/reports/mine", headers=auth(reporter_token)).json()
    assert mine["total"] == 1
    assert mine["reports"][0]["reason"] == "harassment"


def test_reporting_content_that_does_not_exist_is_refused(client, auth, make_user):
    token, _, _ = make_user("reporter")
    res = client.post(
        "/api/reports",
        headers=auth(token),
        json={
            "content_type": "post",
            "content_id": str(uuid.uuid4()),
            "reason": "spam",
        },
    )
    assert res.status_code == 404


def test_cannot_report_yourself(client, auth, make_user):
    token, user_id, _ = make_user("self")
    res = client.post(
        "/api/reports",
        headers=auth(token),
        json={"content_type": "user", "content_id": user_id, "reason": "spam"},
    )
    assert res.status_code == 400


def test_queue_requires_admin(client, auth, make_user):
    token, _, _ = make_user("rider")
    assert client.get("/api/reports/admin", headers=auth(token)).status_code == 403


def test_report_count_aggregates_distinct_reporters(
    client, auth, make_user, admin
):
    admin_token, _ = admin
    author_token, _, _ = make_user("author")
    a_token, _, _ = make_user("a")
    b_token, _, _ = make_user("b")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "spam"}
    ).json()["id"]

    for token in (a_token, b_token):
        client.post(
            "/api/reports",
            headers=auth(token),
            json={"content_type": "post", "content_id": pid, "reason": "spam"},
        )

    queue = client.get("/api/reports/admin", headers=auth(admin_token)).json()
    row = next(r for r in queue["reports"] if r["content_id"] == pid)
    assert row["report_count"] == 2


def test_resolving_notifies_the_reporter(client, auth, make_user, admin):
    admin_token, _ = admin
    author_token, _, _ = make_user("author")
    reporter_token, _, _ = make_user("reporter")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "spam"}
    ).json()["id"]
    rid = client.post(
        "/api/reports",
        headers=auth(reporter_token),
        json={"content_type": "post", "content_id": pid, "reason": "spam"},
    ).json()["id"]

    res = client.patch(
        f"/api/reports/admin/{rid}",
        headers=auth(admin_token),
        json={"status": "actioned", "resolution_note": "Removed"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "actioned"

    kinds = [
        n["type"]
        for n in client.get(
            "/api/notifications", headers=auth(reporter_token)
        ).json()["notifications"]
    ]
    assert "report_resolved" in kinds


def test_reopening_clears_the_resolution_attribution(
    client, auth, make_user, admin
):
    admin_token, _ = admin
    author_token, _, _ = make_user("author")
    reporter_token, _, _ = make_user("reporter")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "spam"}
    ).json()["id"]
    rid = client.post(
        "/api/reports",
        headers=auth(reporter_token),
        json={"content_type": "post", "content_id": pid, "reason": "spam"},
    ).json()["id"]

    client.patch(
        f"/api/reports/admin/{rid}",
        headers=auth(admin_token),
        json={"status": "actioned"},
    )
    reopened = client.patch(
        f"/api/reports/admin/{rid}",
        headers=auth(admin_token),
        json={"status": "reviewing"},
    ).json()

    assert reopened["resolved_at"] is None
    assert reopened["resolver"] is None


def test_report_outlives_the_content_it_describes(client, auth, make_user):
    """The moderation record is the audit trail; deleting the post must not
    erase the fact that it was reported."""
    author_token, _, _ = make_user("author")
    reporter_token, _, _ = make_user("reporter")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "spam"}
    ).json()["id"]
    client.post(
        "/api/reports",
        headers=auth(reporter_token),
        json={"content_type": "post", "content_id": pid, "reason": "spam"},
    )

    client.delete(f"/api/posts/{pid}", headers=auth(author_token))

    assert client.get("/api/reports/mine", headers=auth(reporter_token)).json()[
        "total"
    ] == 1
