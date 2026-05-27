from tests.conftest import auth_headers, create_destination, signup


def _make_group_ride(client, captain_token, dest_id):
    resp = client.post(
        "/api/rides",
        headers=auth_headers(captain_token),
        json={
            "destination_id": dest_id,
            "title": "WS test ride",
            "planned_date": "2099-01-01",
            "planned_start_time": "08:00:00",
            "max_riders": 10,
            "visibility": "group",
        },
    )
    assert resp.status_code == 201, resp.text
    ride = resp.json()
    return ride["id"], ride["chat_group_id"]


def test_connect_send_receive_echo(client):
    captain = signup(client, "ws-captain@test.com", "Captain")
    dest = create_destination(client, captain["access_token"])
    _ride_id, group_id = _make_group_ride(client, captain["access_token"], dest["id"])

    token = captain["access_token"]
    with client.websocket_connect(f"/api/chat/groups/{group_id}/ws?token={token}") as ws:
        ws.send_json({"body": "hello from the captain"})
        msg = ws.receive_json()
        assert msg["body"] == "hello from the captain"
        assert msg["author"]["id"] == captain["user"]["id"]
        assert msg["chat_group_id"] == group_id

    # Message was actually persisted, not just echoed in-memory.
    resp = client.get(
        f"/api/chat/groups/{group_id}/messages",
        headers=auth_headers(captain["access_token"]),
    )
    assert resp.status_code == 200
    bodies = [m["body"] for m in resp.json()["messages"]]
    assert "hello from the captain" in bodies


def test_non_member_rejected(client):
    captain = signup(client, "ws-captain2@test.com", "Captain")
    outsider = signup(client, "ws-outsider@test.com", "Outsider")
    dest = create_destination(client, captain["access_token"])
    _ride_id, group_id = _make_group_ride(client, captain["access_token"], dest["id"])

    token = outsider["access_token"]
    try:
        with client.websocket_connect(f"/api/chat/groups/{group_id}/ws?token={token}"):
            pass
        raised = False
    except Exception:
        raised = True
    assert raised


def test_invalid_token_rejected(client):
    captain = signup(client, "ws-captain3@test.com", "Captain")
    dest = create_destination(client, captain["access_token"])
    _ride_id, group_id = _make_group_ride(client, captain["access_token"], dest["id"])

    try:
        with client.websocket_connect(
            f"/api/chat/groups/{group_id}/ws?token=not-a-real-token"
        ):
            pass
        raised = False
    except Exception:
        raised = True
    assert raised
