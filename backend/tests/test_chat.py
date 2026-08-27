"""Ride chat over REST and WebSocket — Phase 4 W6."""
from __future__ import annotations

import datetime as dt

import pytest

FUTURE = (dt.date.today() + dt.timedelta(days=12)).isoformat()


@pytest.fixture
def room(client, auth, make_user, make_destination):
    """A group ride with a captain and one approved member."""
    captain_token, captain_id, _ = make_user("cap")
    member_token, member_id, _ = make_user("member")
    outsider_token, _, _ = make_user("outsider")
    dest = make_destination("Chat")

    ride = client.post(
        "/api/rides",
        headers=auth(captain_token),
        json={
            "destination_id": str(dest.id),
            "title": "Chat ride",
            "planned_date": FUTURE,
            "planned_start_time": "07:00:00",
            "visibility": "group",
            "max_riders": 5,
        },
    ).json()
    client.post(f"/api/rides/{ride['id']}/join", headers=auth(member_token))
    client.put(
        f"/api/rides/{ride['id']}/participants/{member_id}",
        headers=auth(captain_token),
        json={"status": "approved"},
    )
    return ride, captain_token, member_token, outsider_token


def test_socket_rejects_an_invalid_token(client, room):
    ride, *_ = room
    with client.websocket_connect(
        f"/api/chat/groups/{ride['chat_group_id']}/ws?token=garbage"
    ) as ws:
        with pytest.raises(Exception):
            ws.receive_json()


def test_socket_rejects_a_non_member(client, room):
    ride, _, _, outsider_token = room
    with client.websocket_connect(
        f"/api/chat/groups/{ride['chat_group_id']}/ws?token={outsider_token}"
    ) as ws:
        with pytest.raises(Exception):
            ws.receive_json()


def test_ping_pong(client, room):
    ride, captain_token, _, _ = room
    with client.websocket_connect(
        f"/api/chat/groups/{ride['chat_group_id']}/ws?token={captain_token}"
    ) as ws:
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_message_reaches_both_sender_and_peer_with_one_identity(client, room):
    """The sender is echoed rather than excluded, so their copy carries the
    same server-assigned id and timestamp everyone else sees."""
    ride, captain_token, member_token, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as cap:
        with client.websocket_connect(
            f"/api/chat/groups/{gid}/ws?token={member_token}"
        ) as mem:
            cap.send_json({"type": "message", "body": "Fuel stop at 8"})
            sender = cap.receive_json()
            peer = mem.receive_json()

    assert sender["type"] == "message"
    assert sender["message"]["body"] == "Fuel stop at 8"
    assert sender["message"]["id"] == peer["message"]["id"]


def test_socket_message_is_persisted_through_the_rest_history(client, auth, room):
    ride, captain_token, member_token, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as ws:
        ws.send_json({"type": "message", "body": "over the socket"})
        ws.receive_json()

    history = client.get(
        f"/api/chat/groups/{gid}/messages", headers=auth(member_token)
    ).json()
    assert "over the socket" in [m["body"] for m in history["messages"]]


def test_a_rest_post_is_pushed_to_live_sockets(client, auth, room):
    """A sync route handler runs in a threadpool; the manager holds the
    server's event loop so it can still schedule the broadcast."""
    ride, captain_token, member_token, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as ws:
        client.post(
            f"/api/chat/groups/{gid}/messages",
            headers=auth(member_token),
            json={"body": "posted over REST"},
        )
        pushed = ws.receive_json()

    assert pushed["message"]["body"] == "posted over REST"


@pytest.mark.parametrize(
    "frame",
    [
        {"type": "message", "body": ""},
        {"type": "bogus"},
        {"type": "message"},
    ],
)
def test_bad_frames_are_non_fatal(client, room, frame):
    """A malformed frame is not a reason to make the client rebuild its
    connection."""
    ride, captain_token, _, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as ws:
        ws.send_json(frame)
        err = ws.receive_json()
        assert err["type"] == "error"

        # Still usable afterwards.
        ws.send_json({"type": "ping"})
        assert ws.receive_json() == {"type": "pong"}


def test_cancelled_ride_chat_is_read_only_over_the_socket(client, auth, room):
    """Status is re-read per frame: a socket can outlive the cancellation."""
    ride, captain_token, _, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as ws:
        client.delete(f"/api/rides/{ride['id']}", headers=auth(captain_token))
        ws.send_json({"type": "message", "body": "after cancel"})
        err = ws.receive_json()

    assert err["type"] == "error"
    assert "read-only" in err["detail"]


def test_socket_notifies_offline_members(client, auth, room):
    ride, captain_token, member_token, _ = room
    gid = ride["chat_group_id"]

    with client.websocket_connect(f"/api/chat/groups/{gid}/ws?token={captain_token}") as ws:
        ws.send_json({"type": "message", "body": "wake up"})
        ws.receive_json()

    kinds = [
        n["type"]
        for n in client.get("/api/notifications", headers=auth(member_token)).json()[
            "notifications"
        ]
    ]
    assert "chat_message" in kinds
