"""Chat router — M5 real per-ride chat (replaces the M1 MOCK_MESSAGES stub).

Surface (all under ``/api/chat``):

  GET    /api/chat/groups                   — list groups the caller can access
  GET    /api/chat/groups/{id}              — detail w/ slim ride summary
  GET    /api/chat/groups/{id}/messages     — since-polling, ASC chronological
  POST   /api/chat/groups/{id}/messages     — send (1–2000 chars, trimmed)
  DELETE /api/chat/messages/{id}            — author or captain only, hard delete

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

from datetime import datetime
from typing import Optional, Tuple
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.dependencies import get_current_user, get_db
from app.models.chat import ChatGroup, ChatMessage
from app.models.ride import (
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
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

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _user_is_approved_member(
    db: Session, ride_plan_id: UUID, user_id: UUID
) -> bool:
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


def _load_group_or_404(
    db: Session, group_id: UUID, user: User
) -> Tuple[ChatGroup, str]:
    """Load the group with ride+destination eager-loaded, gate by membership.

    Returns ``(group, role)`` where role is ``"captain"`` or ``"participant"``.
    Raises 404 for non-members (don't leak existence) and 404 for missing
    groups (same response, can't distinguish from outside).
    """
    group = (
        db.query(ChatGroup)
        .options(
            joinedload(ChatGroup.ride_plan).joinedload(RidePlan.destination)
        )
        .filter(ChatGroup.id == group_id)
        .first()
    )
    if not group or group.ride_plan is None:
        raise HTTPException(status_code=404, detail="Chat group not found")

    ride = group.ride_plan
    if ride.captain_id == user.id:
        return group, "captain"

    if _user_is_approved_member(db, ride.id, user.id):
        return group, "participant"

    raise HTTPException(status_code=404, detail="Chat group not found")


def _approved_counts_for(
    db: Session, ride_ids: list[UUID]
) -> dict[UUID, int]:
    """Single-query batch count of approved participants across rides.

    Mirrors the helper in routers/rides.py — duplicated here rather than
    cross-importing to keep the chat router free of router-to-router imports.
    """
    if not ride_ids:
        return {}
    rows = (
        db.query(
            RidePlanParticipant.ride_plan_id,
            func.count(RidePlanParticipant.id),
        )
        .filter(
            RidePlanParticipant.ride_plan_id.in_(ride_ids),
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .group_by(RidePlanParticipant.ride_plan_id)
        .all()
    )
    return {rid: cnt for rid, cnt in rows}


def _build_group_out(
    group: ChatGroup, participant_count: int
) -> ChatGroupOut:
    ride = group.ride_plan
    return ChatGroupOut(
        id=group.id,
        ride_plan_id=group.ride_plan_id,
        name=group.name,
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
    group, _ = _load_group_or_404(db, group_id, user)
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
    since: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatMessageListResponse:
    # 404 if not a member — must come before any data work to avoid leaks.
    _load_group_or_404(db, group_id, user)

    base = (
        db.query(ChatMessage)
        .options(selectinload(ChatMessage.author))
        .filter(ChatMessage.chat_group_id == group_id)
    )

    if since is not None:
        # Poll mode: strictly newer than the caller's last-seen ts, ASC so the
        # client can directly append.
        rows = (
            base.filter(ChatMessage.created_at > since)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .limit(limit)
            .all()
        )
        has_more = len(rows) == limit
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
    _load_group_or_404(db, group_id, user)

    msg = ChatMessage(
        chat_group_id=group_id,
        author_id=user.id,
        body=payload.body,
    )
    db.add(msg)
    # TODO M6: notify other approved participants of the new message.
    db.commit()

    # Re-fetch with the author relationship eager-loaded so the response build
    # doesn't lazy-load (same pattern as M4 rating-submit fix from audit #18).
    fresh = (
        db.query(ChatMessage)
        .options(selectinload(ChatMessage.author))
        .filter(ChatMessage.id == msg.id)
        .one()
    )
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
