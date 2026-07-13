"""Notification feed router — Phase 4 W5.

Surface (all under ``/api/notifications``, all auth-required):

  GET    /                  — my feed, paginated, optional unread-only filter
  GET    /unread-count      — bell badge counter
  POST   /{id}/read         — mark one read
  POST   /read-all          — mark everything read
  DELETE /{id}              — dismiss one

Design notes
------------
- Every endpoint is scoped to the calling user. There is no way to read
  another user's notifications and no admin override; ownership is checked by
  putting ``user_id`` in the WHERE clause rather than by loading the row and
  comparing afterwards, so a mismatched id is a 404 and leaks nothing about
  whether that notification exists.
- ``read_at`` is a timestamp rather than a boolean so "mark all read" is
  auditable and the client can group by when things were seen.
- Marking read is idempotent: re-reading an already-read notification returns
  the existing timestamp instead of overwriting it, so the "seen at" moment
  survives a double-tap.
- The list response carries ``unread`` alongside ``total`` so the bell counter
  and the feed can be populated from a single request.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    MarkReadResponse,
    NotificationListResponse,
    NotificationOut,
    UnreadCountResponse,
)
from app.services import notifications as notification_service

router = APIRouter()


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationListResponse:
    base = db.query(Notification).filter(Notification.user_id == user.id)
    if unread_only:
        base = base.filter(Notification.read_at.is_(None))

    total = base.with_entities(func.count(Notification.id)).scalar() or 0

    rows = (
        base.options(selectinload(Notification.actor))
        # id.desc() is the tiebreaker: two notifications written in the same
        # transaction share a created_at to the microsecond, and without a
        # total order the same row can appear on two pages.
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    return NotificationListResponse(
        notifications=[NotificationOut.model_validate(r) for r in rows],
        total=total,
        unread=notification_service.unread_count(db, user.id),
        page=page,
        limit=limit,
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    return UnreadCountResponse(unread=notification_service.unread_count(db, user.id))


@router.post("/read-all", response_model=MarkReadResponse)
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarkReadResponse:
    """Mark every unread notification read. Returns how many changed.

    Declared before ``/{notification_id}/read`` so the literal path wins the
    route match — otherwise "read-all" would be parsed as a notification id
    and 422 on the UUID coercion.
    """
    marked = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .update(
            {Notification.read_at: datetime.now(timezone.utc)},
            synchronize_session=False,
        )
    )
    db.commit()
    return MarkReadResponse(marked=marked)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    row = (
        db.query(Notification)
        .options(selectinload(Notification.actor))
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found")

    # Idempotent — keep the original "seen at" instead of overwriting it.
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)

    return NotificationOut.model_validate(row)


@router.delete("/{notification_id}")
def dismiss(
    notification_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Dismiss one notification.

    Returns 204 via an explicit ``Response`` rather than the decorator's
    ``status_code=204`` — matching ``chat.delete_message`` and
    ``users.unfollow_user``, and avoiding FastAPI's assertion that a 204 route
    must not declare a response body.
    """
    deleted = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
        .delete(synchronize_session=False)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.commit()
    return Response(status_code=204)
