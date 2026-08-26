from tests.conftest import auth_headers, signup


def test_create_like_and_comment_on_post(client):
    author = signup(client, "author@test.com", "Author")
    other = signup(client, "other@test.com", "Other")

    resp = client.post(
        "/api/feed",
        headers=auth_headers(author["access_token"]),
        json={"caption": "Great ride today"},
    )
    assert resp.status_code == 201, resp.text
    post = resp.json()
    assert post["like_count"] == 0
    assert post["comment_count"] == 0

    resp = client.post(
        f"/api/feed/{post['id']}/like", headers=auth_headers(other["access_token"])
    )
    assert resp.status_code == 204

    # Liking twice is idempotent, not an error.
    resp = client.post(
        f"/api/feed/{post['id']}/like", headers=auth_headers(other["access_token"])
    )
    assert resp.status_code == 204

    resp = client.post(
        f"/api/feed/{post['id']}/comments",
        headers=auth_headers(other["access_token"]),
        json={"body": "Nice!"},
    )
    assert resp.status_code == 201, resp.text

    resp = client.get(f"/api/feed/{post['id']}", headers=auth_headers(other["access_token"]))
    assert resp.status_code == 200
    body = resp.json()
    assert body["like_count"] == 1
    assert body["comment_count"] == 1
    assert body["liked_by_me"] is True


def test_only_author_can_delete_post(client):
    author = signup(client, "author2@test.com", "Author")
    other = signup(client, "other2@test.com", "Other")

    resp = client.post(
        "/api/feed",
        headers=auth_headers(author["access_token"]),
        json={"caption": "My ride"},
    )
    post_id = resp.json()["id"]

    resp = client.delete(f"/api/feed/{post_id}", headers=auth_headers(other["access_token"]))
    assert resp.status_code == 403

    resp = client.delete(f"/api/feed/{post_id}", headers=auth_headers(author["access_token"]))
    assert resp.status_code == 204
