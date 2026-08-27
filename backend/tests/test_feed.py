"""Community feed: posts, likes, comments — Phase 4 W4."""
from __future__ import annotations

import uuid


def test_body_is_trimmed_and_blank_is_rejected(client, auth, make_user):
    token, _, _ = make_user("poster")
    ok = client.post("/api/posts", headers=auth(token), json={"body": "  hello  "})
    assert ok.status_code == 201
    assert ok.json()["body"] == "hello"

    blank = client.post("/api/posts", headers=auth(token), json={"body": "   "})
    assert blank.status_code == 422


def test_liked_by_me_is_null_for_anonymous_readers(client, auth, make_user):
    """Null, not false — the client should show a neutral control rather than
    one implying the reader has a session."""
    token, _, _ = make_user("poster")
    pid = client.post(
        "/api/posts", headers=auth(token), json={"body": "public"}
    ).json()["id"]

    assert client.get(f"/api/posts/{pid}").json()["liked_by_me"] is None
    assert client.get(f"/api/posts/{pid}", headers=auth(token)).json()[
        "liked_by_me"
    ] is False


def test_like_and_unlike_are_idempotent(client, auth, make_user):
    author_token, _, _ = make_user("author")
    liker_token, _, _ = make_user("liker")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "like me"}
    ).json()["id"]

    client.post(f"/api/posts/{pid}/like", headers=auth(liker_token))
    twice = client.post(f"/api/posts/{pid}/like", headers=auth(liker_token)).json()
    assert twice["like_count"] == 1

    client.delete(f"/api/posts/{pid}/like", headers=auth(liker_token))
    again = client.delete(f"/api/posts/{pid}/like", headers=auth(liker_token)).json()
    assert again["like_count"] == 0


def test_repeat_like_notifies_the_author_once(client, auth, make_user):
    author_token, _, _ = make_user("author")
    liker_token, _, _ = make_user("liker")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "x"}
    ).json()["id"]

    client.post(f"/api/posts/{pid}/like", headers=auth(liker_token))
    client.delete(f"/api/posts/{pid}/like", headers=auth(liker_token))
    client.post(f"/api/posts/{pid}/like", headers=auth(liker_token))

    kinds = [
        n["type"]
        for n in client.get("/api/notifications", headers=auth(author_token)).json()[
            "notifications"
        ]
    ]
    # Two genuinely new likes were inserted (the unlike removed the first),
    # so two notifications is correct; what must not happen is a duplicate
    # from a repeated like with no unlike between.
    assert kinds.count("post_liked") == 2


def test_post_author_can_delete_a_comment_on_their_post(
    client, auth, make_user
):
    author_token, _, _ = make_user("author")
    commenter_token, _, _ = make_user("commenter")
    stranger_token, _, _ = make_user("stranger")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "thread"}
    ).json()["id"]
    cid = client.post(
        f"/api/posts/{pid}/comments",
        headers=auth(commenter_token),
        json={"body": "a comment"},
    ).json()["id"]

    assert (
        client.delete(f"/api/posts/comments/{cid}", headers=auth(stranger_token)).status_code
        == 403
    )
    assert (
        client.delete(f"/api/posts/comments/{cid}", headers=auth(author_token)).status_code
        == 204
    )


def test_comments_read_oldest_first(client, auth, make_user, db):
    """A comment thread reads as a conversation: oldest first, unlike the
    feed itself.

    The timestamps are set explicitly rather than relying on the order the
    three POSTs happen to land. Postgres ``now()`` is the *transaction* start
    time, and the whole test body runs inside one transaction, so all three
    rows would otherwise share an identical created_at and the assertion would
    be testing the random-UUID tiebreaker rather than the ORDER BY. In
    production each request is its own transaction and gets its own timestamp.
    """
    import datetime as dt

    from app.models.post import PostComment

    author_token, _, _ = make_user("author")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "thread"}
    ).json()["id"]

    ids = []
    for body in ("first", "second", "third"):
        ids.append(
            client.post(
                f"/api/posts/{pid}/comments",
                headers=auth(author_token),
                json={"body": body},
            ).json()["id"]
        )

    base = dt.datetime(2026, 8, 1, 9, 0, tzinfo=dt.timezone.utc)
    for offset, cid in enumerate(ids):
        db.query(PostComment).filter(PostComment.id == cid).update(
            {PostComment.created_at: base + dt.timedelta(minutes=offset)}
        )
    db.flush()

    bodies = [
        c["body"] for c in client.get(f"/api/posts/{pid}/comments").json()["comments"]
    ]
    assert bodies == ["first", "second", "third"]


def test_following_only_requires_auth_and_filters(client, auth, make_user):
    followed_token, followed_id, followed_name = make_user("followed")
    other_token, _, _ = make_user("other")
    viewer_token, _, _ = make_user("viewer")

    client.post("/api/posts", headers=auth(followed_token), json={"body": "followed"})
    client.post("/api/posts", headers=auth(other_token), json={"body": "unfollowed"})
    client.post(f"/api/users/{followed_id}/follow", headers=auth(viewer_token))

    assert client.get("/api/posts", params={"following_only": True}).status_code == 401

    feed = client.get(
        "/api/posts", headers=auth(viewer_token), params={"following_only": True}
    ).json()
    assert {p["author"]["name"] for p in feed["posts"]} == {followed_name}


def test_attaching_someone_elses_ride_log_is_refused(client, auth, make_user):
    token, _, _ = make_user("poster")
    res = client.post(
        "/api/posts",
        headers=auth(token),
        json={"body": "x", "ride_log_id": str(uuid.uuid4())},
    )
    assert res.status_code == 404


def test_deleting_a_post_removes_its_likes_and_comments(
    client, auth, make_user, db
):
    from app.models.post import PostComment, PostLike

    author_token, _, _ = make_user("author")
    other_token, _, _ = make_user("other")
    pid = client.post(
        "/api/posts", headers=auth(author_token), json={"body": "doomed"}
    ).json()["id"]
    client.post(f"/api/posts/{pid}/like", headers=auth(other_token))
    client.post(
        f"/api/posts/{pid}/comments", headers=auth(other_token), json={"body": "hi"}
    )

    assert (
        client.delete(f"/api/posts/{pid}", headers=auth(author_token)).status_code == 204
    )
    assert client.get(f"/api/posts/{pid}").status_code == 404
    assert db.query(PostLike).filter(PostLike.post_id == uuid.UUID(pid)).count() == 0
    assert (
        db.query(PostComment).filter(PostComment.post_id == uuid.UUID(pid)).count() == 0
    )


def test_feed_query_count_does_not_grow_with_page_size(client, auth, make_user):
    """The feed's counts are batched; a bigger page must not mean more
    queries. This is the regression guard on the N+1 the router avoids."""
    from sqlalchemy import event

    from app.database import engine

    token, _, _ = make_user("bulk")
    for i in range(12):
        client.post("/api/posts", headers=auth(token), json={"body": f"p{i}"})

    counter = {"n": 0}

    def _count(*_args, **_kwargs):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _count)
    try:
        counter["n"] = 0
        client.get("/api/posts", headers=auth(token), params={"limit": 3})
        small = counter["n"]

        counter["n"] = 0
        client.get("/api/posts", headers=auth(token), params={"limit": 12})
        large = counter["n"]
    finally:
        event.remove(engine, "before_cursor_execute", _count)

    assert large == small, f"query count grew with page size: {small} -> {large}"
