"""Chat router — M5 real per-ride chat (replaces the M1 MOCK_MESSAGES stub).

Surface (all under ``/api/chat``):

  GET    /api/chat/groups                   — list groups the caller can access
  GET    /api/chat/groups/{id}              — detail w/ slim ride summary
  GET    /api/chat/groups/{id}/messages     — since-polling, ASC chronological
  POST   /api/chat/groups/{id}/messages     — send (1-2000 chars, trimmed)
  DELETE /api/chat/messages/{id}            — author or captain only, hard delete
  WS     /api/chat/groups/{id}/ws           — live send/broadcast, auth via ?token=

The WebSocket endpoint is additive — it reuses the same membership check,
the same read-only-if-cancelled rule, and the same message-persistence path
as the HTTP POST route (through the shared ``_create_message`` helper) so
the two surfaces can never drift apart on validation. The HTTP GET/POST
endpoints stay as-is for history/polling; the frontend is expected to use
GET for history and the WS connection for live updates.

Authorization is strict — captain OR participant with ``status=approved``.
Pending / rejected / left users get **404** (not 403) so the existence of
private chat groups doesn't leak. Non-members trying to DELETE a message also
get 404; members trying to delete a message they don't own (and aren't the
captain for) get 403.

Solo rides have no ChatGroup (M3 decision: ``visibility=group`` only triggers
ChatGroup creation), so every endpoint here naturally 404s for solo rides
without special-casing — the group simply doesn't exist.

Patterns reused from M2/M3/M4 audits:
  - ``selectinload`` for author/ride_plan/destination to avoid N+1.
  - Stable ``.id.asc()`` tiebreaker on every paginated query.
  - 404-on-membership-miss vs 403-on-known-member-wrong-action.
"""
from __future__ import annotations

from typing import Dict, Optional, Set
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import ValidationError
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import SessionLocal
from app.dependencies import _decode_token, get_current_user, get_db
from app.models.chat import ChatGroup, ChatMessage
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.user import User
from app.schemas.chat import (
    ChatGroupListResponse,
    ChatGroupOut,
    ChatGroupRide,
    ChatMessageCreate,
    ChatMessageListResponse,
    ChatMessageOut,
)
from app.services.ride_helpers import approved_counts_for as _approved_counts_for

router = APIRouter()


# ---------------------------------------------------------------------------
# In-memory connection registry for the WebSocket endpoint.
#
# Single-process only: a multi-instance deployment (more than one uvicorn
# worker/pod) would need a pub/sub backplane (e.g. Redis) so a message sent
# to a socket on instance A reaches members connected to instance B. This
# repo's docker-compose has no Redis, so this in-memory map is the
# intentionally simple starting point.
# ---------------------------------------------------------------------------
class ConnectionManager:
    def __init__(self) -> None:
        self._groups: Dict[UUID, Set[WebSocket]] = {}

    async def connect(self, group_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._groups.setdefault(group_id, set()).add(websocket)

    def disconnect(self, group_id: UUID, websocket: WebSocket) -> None:
        sockets = self._groups.get(group_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self._groups.pop(group_id, None)

    async def broadcast(self, group_id: UUID, payload: dict) -> None:
        for socket in list(self._groups.get(group_id, ())):
            try:
                await socket.send_json(payload)
            except Exception:  # noqa: BLE001 - a dead socket shouldn't break the loop
                self.disconnect(group_id, socket)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _user_is_approved_member(
    db: Session, ride_plan_id: UUID, user_id: UUID
) -> bool:
    """Standalone membership check used by delete_message where we don't go
    through ``_load_group_or_404`` (the message lookup already has the ride
    in hand)."""
    return (
        db.query(RidePlanParticipant.id)
        .filter(
            RidePlanParticipant.ride_plan_id == ride_plan_id,
            RidePlanParticipant.user_id == user_id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .first()
        is not None
    )


def _find_group_if_member(
    db: Session, group_id: UUID, user: User
) -> Optional[ChatGroup]:
    """Load the group + check membership in a SINGLE SQL statement, or
    return ``None`` if the group doesn't exist or the caller isn't a
    member. No exception raised — the WebSocket route needs to close with
    a WS-specific code instead of an HTTPException, so the raising variant
    (``_load_group_or_404``) wraps this rather than duplicating the query.

    Audit #10: the previous two-query implementation (group lookup, then
    participant lookup) had a measurable timing difference between
    "group doesn't exist" (1 query) and "group exists but you're not a
    member" (2 queries). Both returned 404 but were distinguishable by
    response time, defeating the don't-leak-existence intent.

    This collapses to one query: ``ChatGroup JOIN ride_plans JOIN destinations
    LEFT JOIN ride_plan_participants`` (the last filtered on the caller +
    ``status=approved``). Captain access is checked in Python after the
    fetch — same query cost either way.

    Audit #15: the previous ``(group, role)`` tuple return was unused at
    every call site; reverted to bare ``ChatGroup``.
    """
    result = (
        db.query(ChatGroup, RidePlanParticipant.id.label("membership_id"))
        .options(
            joinedload(ChatGroup.ride_plan).joinedload(RidePlan.destination)
        )
        .outerjoin(
            RidePlanParticipant,
            and_(
                RidePlanParticipant.ride_plan_id == ChatGroup.ride_plan_id,
                RidePlanParticipant.user_id == user.id,
                RidePlanParticipant.status == ParticipantStatus.approved,
            ),
        )
        .filter(ChatGroup.id == group_id)
        .first()
    )
    if result is None:
        return None

    group, membership_id = result
    ride = group.ride_plan
    if ride is None:
        # Audit #16 — defensive; ride_plan_id is NOT NULL + CASCADE so this
        # branch is unreachable today. Kept as belt-and-braces against future
        # schema changes that loosen the FK.
        return None

    if ride.captain_id == user.id or membership_id is not None:
        return group

    return None


def _load_group_or_404(
    db: Session, group_id: UUID, user: User
) -> ChatGroup:
    group = _find_group_if_member(db, group_id, user)
    if group is None:
        raise HTTPException(status_code=404, detail="Chat group not found")
    return group


def _create_message(db: Session, group_id: UUID, user: User, body: str) -> ChatMessage:
    """Persist a chat message and return it with ``author`` eager-loaded.

    Shared by the HTTP POST route and the WebSocket route so both surfaces
    validate and write messages identically. Caller is responsible for the
    membership + cancelled-ride checks; this just does the write.
    """
    msg = ChatMessage(chat_group_id=group_id, author_id=user.id, body=body)
    db.add(msg)
    db.commit()

    return (
        db.query(ChatMessage)
        .options(selectinload(ChatMessage.author))
        .filter(ChatMessage.id == msg.id)
        .one()
    )


def _build_group_out(
    group: ChatGroup, participant_count: int
) -> ChatGroupOut:
    """Audit #14: the canonical display name for a chat room is the live
    ``ride.title`` — ``chat_groups.name`` was set at creation and silently
    drifts when the captain renames the ride via ``PUT /api/rides/{id}``.
    Sourcing from ``ride.title`` keeps the chat header in sync. The DB
    column is now vestigial; M9 can drop it."""
    ride = group.ride_plan
    return ChatGroupOut(
        id=group.id,
        ride_plan_id=group.ride_plan_id,
        name=ride.title if ride is not None else group.name,
        ride=ChatGroupRide(
            id=ride.id,
            title=ride.title,
            planned_date=ride.planned_date,
            status=ride.status,
            captain_id=ride.captain_id,
            destination_id=ride.destination_id,
            destination_name=ride.destination.name if ride.destination else None,
            participant_count=participant_count,
        ),
    )


# ---------------------------------------------------------------------------
# List groups
# ---------------------------------------------------------------------------
@router.get("/groups", response_model=ChatGroupListResponse)
def list_groups(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatGroupListResponse:
    captain_rides = (
        db.query(RidePlan.id).filter(RidePlan.captain_id == user.id).subquery()
    )
    approved_rides = (
        db.query(RidePlanParticipant.ride_plan_id)
        .filter(
            RidePlanParticipant.user_id == user.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .subquery()
    )

    base = (
        db.query(ChatGroup)
        .join(RidePlan, RidePlan.id == ChatGroup.ride_plan_id)
        .options(
            joinedload(ChatGroup.ride_plan).joinedload(RidePlan.destination)
        )
        .filter(
            or_(
                ChatGroup.ride_plan_id.in_(captain_rides),
                ChatGroup.ride_plan_id.in_(approved_rides),
            )
        )
    )

    total = base.with_entities(func.count(ChatGroup.id)).scalar() or 0
    rows = (
        base.order_by(RidePlan.planned_date.desc(), ChatGroup.id.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    counts = _approved_counts_for(db, [g.ride_plan_id for g in rows])
    return ChatGroupListResponse(
        groups=[_build_group_out(g, counts.get(g.ride_plan_id, 0)) for g in rows],
        total=total,
        page=page,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Group detail
# ---------------------------------------------------------------------------
@router.get("/groups/{group_id}", response_model=ChatGroupOut)
def get_group(
    group_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatGroupOut:
    group = _load_group_or_404(db, group_id, user)
    counts = _approved_counts_for(db, [group.ride_plan_id])
    return _build_group_out(group, counts.get(group.ride_plan_id, 0))


# ---------------------------------------------------------------------------
# Messages — list / poll
# ---------------------------------------------------------------------------
@router.get(
    "/groups/{group_id}/messages", response_model=ChatMessageListResponse
)
def list_messages(
    group_id: UUID,
    after_id: Optional[UUID] = Query(
        default=None,
        description="Forward keyset cursor. Returns messages strictly after this one in (created_at, id) order — used for polling.",
    ),
    before_id: Optional[UUID] = Query(
        default=None,
        description="Backward keyset cursor. Returns messages strictly before this one — used to load older history.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatMessageListResponse:
    # 404 if not a member — must come before any data work to avoid leaks.
    _load_group_or_404(db, group_id, user)

    if after_id is not None and before_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Pass either after_id (poll forward) or before_id (page back), not both.",
        )

    base = (
        db.query(ChatMessage)
        .options(selectinload(ChatMessage.author))
        .filter(ChatMessage.chat_group_id == group_id)
    )

    if after_id is not None:
        # Audit #3: switched from `since: datetime > created_at` to keyset
        # `(created_at, id) > (anchor.created_at, anchor.id)`. The plain
        # timestamp compare silently drops messages with identical
        # microsecond timestamps under contention; the tuple form orders
        # ties by id so nothing falls through the cracks.
        anchor = (
            db.query(ChatMessage.created_at)
            .filter(
                ChatMessage.id == after_id,
                ChatMessage.chat_group_id == group_id,
            )
            .first()
        )
        if anchor is None:
            raise HTTPException(
                status_code=400,
                detail="after_id does not reference a message in this chat group",
            )
        anchor_ts = anchor[0]
        rows = (
            base.filter(
                or_(
                    ChatMessage.created_at > anchor_ts,
                    and_(
                        ChatMessage.created_at == anchor_ts,
                        ChatMessage.id > after_id,
                    ),
                )
            )
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .limit(limit)
            .all()
        )
        has_more = len(rows) == limit
    elif before_id is not None:
        # Audit #4: backward history paging — symmetric to after_id. Client
        # passes the oldest currently-rendered message id; server returns
        # the page of older messages, returned ASC so the client can prepend.
        anchor = (
            db.query(ChatMessage.created_at)
            .filter(
                ChatMessage.id == before_id,
                ChatMessage.chat_group_id == group_id,
            )
            .first()
        )
        if anchor is None:
            raise HTTPException(
                status_code=400,
                detail="before_id does not reference a message in this chat group",
            )
        anchor_ts = anchor[0]
        rows = (
            base.filter(
                or_(
                    ChatMessage.created_at < anchor_ts,
                    and_(
                        ChatMessage.created_at == anchor_ts,
                        ChatMessage.id < before_id,
                    ),
                )
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
            .all()
        )
        has_more = len(rows) == limit
        rows = list(reversed(rows))
    else:
        # Initial load: fetch the newest `limit`, return chronologically.
        rows = (
            base.order_by(
                ChatMessage.created_at.desc(), ChatMessage.id.desc()
            )
            .limit(limit)
            .all()
        )
        has_more = len(rows) == limit
        rows = list(reversed(rows))

    return ChatMessageListResponse(
        messages=[ChatMessageOut.model_validate(m) for m in rows],
        has_more=has_more,
    )


# ---------------------------------------------------------------------------
# Send message
# ---------------------------------------------------------------------------
@router.post(
    "/groups/{group_id}/messages",
    response_model=ChatMessageOut,
    status_code=201,
)
def send_message(
    group_id: UUID,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatMessageOut:
    group = _load_group_or_404(db, group_id, user)

    # Audit #12: cancelled rides are read-only chats. Reads still work
    # (post-mortem / archive), writes don't. Completed rides remain writable
    # so riders can keep posting recaps + photos.
    if group.ride_plan.status == RidePlanStatus.cancelled:
        raise HTTPException(
            status_code=409,
            detail="This ride was cancelled — its chat is read-only",
        )

    # TODO M6: notify other approved participants of the new message.
    fresh = _create_message(db, group_id, user, payload.body)
    return ChatMessageOut.model_validate(fresh)


# ---------------------------------------------------------------------------
# Delete message (author OR captain — hard delete)
# ---------------------------------------------------------------------------
@router.delete("/messages/{message_id}")
def delete_message(
    message_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    msg = (
        db.query(ChatMessage)
        .options(
            joinedload(ChatMessage.chat_group).joinedload(ChatGroup.ride_plan)
        )
        .filter(ChatMessage.id == message_id)
        .first()
    )
    if not msg or msg.chat_group is None or msg.chat_group.ride_plan is None:
        raise HTTPException(status_code=404, detail="Message not found")

    ride = msg.chat_group.ride_plan

    # Audit #12: cancelled rides are read-only chats — moderation must happen
    # before the cancel. Returning 409 instead of 403/404 because the caller
    # may have legit author/captain rights; the ride state itself is the block.
    if ride.status == RidePlanStatus.cancelled:
        raise HTTPException(
            status_code=409,
            detail="This ride was cancelled — its chat is read-only",
        )

    is_captain = ride.captain_id == user.id
    is_author = msg.author_id == user.id

    if not is_captain:
        # Non-captain — must be an approved member just to see this message.
        # Non-members get 404 (don't leak existence). Members who aren't the
        # author get 403 (they can see it, just not delete it).
        if not _user_is_approved_member(db, ride.id, user.id):
            raise HTTPException(status_code=404, detail="Message not found")
        if not is_author:
            raise HTTPException(
                status_code=403,
                detail="Only the message author or the ride captain can delete this message",
            )

    db.delete(msg)
    # TODO M6: optionally notify the room (e.g. "message deleted by captain").
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Live chat — WebSocket
# ---------------------------------------------------------------------------
@router.websocket("/groups/{group_id}/ws")
async def chat_ws(websocket: WebSocket, group_id: UUID) -> None:
    """Live send/broadcast for a chat group's messages.

    Auth: JWT passed as ``?token=`` (browsers can't set an Authorization
    header on a WebSocket handshake). Decoded with the same
    ``_decode_token`` helper ``get_current_user`` uses, so the two paths
    can't drift on token-validation rules. Invalid/expired token closes
    with 4401; not a member of the group closes with 4404; connecting to
    a cancelled ride's chat closes with 4409 (its chat is read-only —
    viewers should use the existing GET history endpoint instead).

    A plain ``Depends(get_db)`` doesn't work for WebSocket routes the way
    it does for HTTP ones (there's no per-request lifecycle to hang it
    off), so this opens its own session for the life of the connection.
    """
    token = websocket.query_params.get("token")
    user_id = _decode_token(token) if token else None
    if user_id is None:
        await websocket.close(code=4401)
        return

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            await websocket.close(code=4401)
            return

        group = _find_group_if_member(db, group_id, user)
        if group is None:
            await websocket.close(code=4404)
            return

        if group.ride_plan.status == RidePlanStatus.cancelled:
            # Read-only rides: reject the whole connection. Viewers can
            # still fetch history via the existing HTTP GET endpoint.
            await websocket.close(code=4409)
            return

        await manager.connect(group_id, websocket)
        try:
            while True:
                try:
                    raw = await websocket.receive_json()
                    payload = ChatMessageCreate.model_validate(raw)
                except (ValidationError, ValueError):
                    # Malformed frame (bad JSON or failed body validation)
                    # — ignore it and keep the connection open rather than
                    # dropping the whole socket over one bad message.
                    continue

                fresh = _create_message(db, group_id, user, payload.body)
                out = ChatMessageOut.model_validate(fresh).model_dump(mode="json")
                # Broadcast to everyone in the group, including the sender —
                # doubles as the send ack so the client doesn't need to
                # locally echo before the server confirms persistence.
                await manager.broadcast(group_id, out)
        except WebSocketDisconnect:
            pass
        finally:
            manager.disconnect(group_id, websocket)
    finally:
        db.close()
