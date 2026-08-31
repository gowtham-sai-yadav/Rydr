"""Live ride tracking - WebSocket location broadcast for an in-progress
group ride, so approved riders can see each other's position on a map in
real time, plus who's covered the most ground so far.

Same "no per-request lifecycle" reasoning as chat.py's WS route applies
here: this opens its own SessionLocal() for membership checks rather than
Depends(get_db), and reuses the exact same ConnectionManager pattern
(in-memory, single-process - see chat.py's docstring on why that's the
intentional starting point without Redis in the stack).

Nothing here is persisted. This is live-only: close the tab (web) or end
the ride (mobile) and the track is gone. Persisting the finished track
onto the RideLog is what `POST /api/ride-logs` already accepts a
`recorded_track` field for.

Two ways in: the WebSocket handler below (web's browser-Geolocation
auto-recorder, and mobile while foregrounded) and `POST .../position`
(mobile's background location task, which runs outside the component
tree and can't hold a live socket ref). Both write through the same
in-memory manager.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.dependencies import decode_token, get_current_user, get_db
from app.models.ride import ParticipantStatus, RidePlan, RidePlanParticipant, RidePlanStatus
from app.models.user import User

router = APIRouter()


class PositionUpdate(BaseModel):
    lat: float
    lng: float
    speed_kmh: Optional[float] = None


class LiveRideManager:
    """Per-ride socket registry + last-known position snapshot, so a rider
    who joins the live view late immediately sees where everyone already
    is instead of waiting for their next ping."""

    def __init__(self) -> None:
        self._sockets: Dict[UUID, Dict[UUID, WebSocket]] = {}
        self._last_position: Dict[UUID, Dict[UUID, dict]] = {}

    async def connect(self, ride_id: UUID, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._sockets.setdefault(ride_id, {})[user_id] = websocket
        # Snapshot everyone currently known, so the new connection isn't
        # blind until other riders' next ping.
        snapshot = list(self._last_position.get(ride_id, {}).values())
        if snapshot:
            await websocket.send_json({"type": "snapshot", "riders": snapshot})

    def disconnect(self, ride_id: UUID, user_id: UUID) -> None:
        sockets = self._sockets.get(ride_id)
        if sockets:
            sockets.pop(user_id, None)
            if not sockets:
                self._sockets.pop(ride_id, None)

    async def update_and_broadcast(self, ride_id: UUID, position: dict) -> None:
        self._last_position.setdefault(ride_id, {})[position["user_id"]] = position
        payload = {"type": "location", **position}
        for uid, socket in list(self._sockets.get(ride_id, {}).items()):
            try:
                await socket.send_json(payload)
            except Exception:  # noqa: BLE001 - dead socket shouldn't break the loop
                self.disconnect(ride_id, uid)

    def clear(self, ride_id: UUID) -> None:
        """Called when a ride completes/cancels - drop the snapshot so a
        future re-open of the same ride id (shouldn't happen, but) starts clean."""
        self._last_position.pop(ride_id, None)


manager = LiveRideManager()


def _approved_member(db, ride_id: UUID, user_id: UUID) -> Optional[RidePlan]:
    ride = db.query(RidePlan).filter(RidePlan.id == ride_id).first()
    if ride is None:
        return None
    if ride.captain_id == user_id:
        return ride
    is_participant = (
        db.query(RidePlanParticipant.id)
        .filter(
            RidePlanParticipant.ride_plan_id == ride_id,
            RidePlanParticipant.user_id == user_id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .first()
        is not None
    )
    return ride if is_participant else None


@router.post("/rides/{ride_id}/live/position")
async def post_position(
    ride_id: UUID,
    payload: PositionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """Plain-HTTP twin of the WebSocket position message, for mobile's
    background location task — a TaskManager callback runs outside the
    component tree and can't reach a live WebSocket ref, but it can always
    fire a fetch. Both paths feed the same in-memory manager, so viewers
    connected over the WS never know or care which one a given rider used."""
    ride = _approved_member(db, ride_id, user.id)
    if ride is None:
        raise HTTPException(status_code=404, detail="Ride not found or not an approved member")
    if ride.status != RidePlanStatus.in_progress:
        raise HTTPException(status_code=409, detail="Ride is not in progress")

    position = {
        "user_id": str(user.id),
        "name": user.name,
        "lat": payload.lat,
        "lng": payload.lng,
        "speed_kmh": payload.speed_kmh,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    await manager.update_and_broadcast(ride_id, position)
    return {"ok": True}


@router.websocket("/rides/{ride_id}/live/ws")
async def live_ride_ws(websocket: WebSocket, ride_id: UUID) -> None:
    """Auth via ?token= (same convention as the chat WS - browsers can't
    set an Authorization header on a WebSocket handshake). Closes 4401 on
    bad/missing token, 4404 if not an approved member of the ride, 4409 if
    the ride isn't in_progress (nothing to track before it starts or after
    it ends)."""
    token = websocket.query_params.get("token")
    user_id = decode_token(token) if token else None
    if user_id is None:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            await websocket.close(code=4401)
            return

        ride = _approved_member(db, ride_id, user.id)
        if ride is None:
            await websocket.close(code=4404)
            return
        if ride.status != RidePlanStatus.in_progress:
            await websocket.close(code=4409)
            return

        await manager.connect(ride_id, user.id, websocket)
        try:
            while True:
                data = await websocket.receive_json()
                lat, lng = data.get("lat"), data.get("lng")
                if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
                    continue
                position = {
                    "user_id": str(user.id),
                    "name": user.name,
                    "lat": lat,
                    "lng": lng,
                    "speed_kmh": data.get("speed_kmh"),
                    "ts": datetime.now(timezone.utc).isoformat(),
                }
                await manager.update_and_broadcast(ride_id, position)
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(ride_id, user.id)
    finally:
        db.close()
