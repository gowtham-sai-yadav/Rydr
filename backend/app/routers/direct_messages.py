"""Direct messages - 1:1 threads, Twitter-style: following someone
(one-directional, not mutual) unlocks messaging them. Following a
private account requires their acceptance first (see
routers/users.py's follow-request flow) - only an *accepted* Follow
row counts here.

Once a thread exists, either side can keep posting to it even if one
later unfollows - same as most chat products don't retroactively lock
existing threads.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db
from app.models.direct_message import DMThread, DirectMessage
from app.models.social import Follow, FollowStatus
from app.models.user import User
from app.models.notification import NotificationType
from app.schemas.direct_message import (
    DirectMessageCreate,
    DirectMessageListResponse,
    DirectMessageOut,
    DMThreadListResponse,
    DMThreadOut,
)
from app.services.notification_service import create_notification as _notify

router = APIRouter()


def _follows(db: Session, follower: UUID, followed: UUID) -> bool:
    return (
        db.query(Follow.follower_id)
        .filter(
            Follow.follower_id == follower,
            Follow.followed_id == followed,
            Follow.status == FollowStatus.accepted,
        )
        .first()
        is not None
    )


def _ordered_pair(a: UUID, b: UUID) -> tuple[UUID, UUID]:
    return (a, b) if str(a) < str(b) else (b, a)


def _other_user_id(thread: DMThread, me: UUID) -> UUID:
    return thread.user_b_id if thread.user_a_id == me else thread.user_a_id


def _get_thread_or_404(db: Session, thread_id: UUID, user: User) -> DMThread:
    thread = db.query(DMThread).filter(DMThread.id == thread_id).first()
    if not thread or user.id not in (thread.user_a_id, thread.user_b_id):
        # 404, not 403 - don't leak that a thread id exists to a non-member.
        raise HTTPException(status_code=404, detail="Thread not found")
    return thread


@router.get("/threads", response_model=DMThreadListResponse)
def list_threads(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DMThreadListResponse:
    threads = (
        db.query(DMThread)
        .filter(or_(DMThread.user_a_id == user.id, DMThread.user_b_id == user.id))
        .options(selectinload(DMThread.user_a), selectinload(DMThread.user_b))
        .all()
    )

    out: list[DMThreadOut] = []
    for t in threads:
        other = t.user_b if t.user_a_id == user.id else t.user_a
        last = (
            db.query(DirectMessage)
            .filter(DirectMessage.thread_id == t.id)
            .order_by(DirectMessage.created_at.desc())
            .first()
        )
        unread = (
            db.query(func.count(DirectMessage.id))
            .filter(
                DirectMessage.thread_id == t.id,
                DirectMessage.author_id != user.id,
                DirectMessage.read_at.is_(None),
            )
            .scalar()
        )
        out.append(
            DMThreadOut(
                id=t.id,
                other_user=other,
                last_message=last.body if last else None,
                last_message_at=last.created_at if last else None,
                unread_count=unread,
            )
        )

    # Most recently active first; threads with no messages yet sort last.
    out.sort(key=lambda t: t.last_message_at or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return DMThreadListResponse(threads=out)


@router.post("/threads/{other_user_id}", response_model=DMThreadOut)
def get_or_create_thread(
    other_user_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DMThreadOut:
    if other_user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    other = db.query(User).filter(User.id == other_user_id).first()
    if not other:
        raise HTTPException(status_code=404, detail="User not found")

    a, b = _ordered_pair(user.id, other_user_id)
    thread = db.query(DMThread).filter(DMThread.user_a_id == a, DMThread.user_b_id == b).first()

    if not thread:
        if not _follows(db, user.id, other_user_id):
            raise HTTPException(
                status_code=403,
                detail="Follow this rider to message them"
                + (" (they'll need to accept first)" if other.is_private else ""),
            )
        thread = DMThread(user_a_id=a, user_b_id=b)
        db.add(thread)
        db.commit()
        db.refresh(thread)

    return DMThreadOut(id=thread.id, other_user=other, last_message=None, last_message_at=None, unread_count=0)


@router.get("/threads/{thread_id}/messages", response_model=DirectMessageListResponse)
def list_messages(
    thread_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DirectMessageListResponse:
    thread = _get_thread_or_404(db, thread_id, user)

    total = db.query(func.count(DirectMessage.id)).filter(DirectMessage.thread_id == thread.id).scalar()
    messages = (
        db.query(DirectMessage)
        .options(selectinload(DirectMessage.author))
        .filter(DirectMessage.thread_id == thread.id)
        .order_by(DirectMessage.created_at.asc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    # Reading the thread marks the other person's messages as read.
    (
        db.query(DirectMessage)
        .filter(
            DirectMessage.thread_id == thread.id,
            DirectMessage.author_id != user.id,
            DirectMessage.read_at.is_(None),
        )
        .update({DirectMessage.read_at: func.now()}, synchronize_session=False)
    )
    db.commit()

    return DirectMessageListResponse(messages=messages, total=total, page=page, limit=limit)


@router.post("/threads/{thread_id}/messages", response_model=DirectMessageOut)
def send_message(
    thread_id: UUID,
    payload: DirectMessageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DirectMessageOut:
    thread = _get_thread_or_404(db, thread_id, user)

    message = DirectMessage(thread_id=thread.id, author_id=user.id, body=payload.body)
    db.add(message)
    db.flush()

    recipient_id = _other_user_id(thread, user.id)
    _notify(
        db,
        user_id=recipient_id,
        type=NotificationType.dm_received,
        message=f"{user.name} sent you a message",
        actor_id=user.id,
    )

    db.commit()
    db.refresh(message)
    return message
