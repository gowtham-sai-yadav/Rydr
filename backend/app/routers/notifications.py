"""Notifications router - Phase 4.

Surface (all under ``/api/notifications``):

  GET  /               - paginated, newest first, caller's own only
  POST /{id}/read       - mark one notification read
  POST /read-all        - mark all the caller's unread notifications read

Authorization model: every route implicitly scopes to the caller via
``Notification.user_id == user.id`` - there is no way to read or mutate
another user's notifications. A notification id that exists but belongs
to someone else 404s (don't leak existence), matching the 404-not-403
convention used elsewhere (chat groups, ride logs).
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationListResponse, NotificationOut

router = APIRouter()


def _unread_count(db: Session, user_id: UUID) -> int:
    return (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .scalar()
        or 0
    )


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationListResponse:
    base = db.query(Notification).filter(Notification.user_id == user.id)
    total = base.with_entities(func.count(Notification.id)).scalar() or 0
    rows = (
        base.order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return NotificationListResponse(
        notifications=[NotificationOut.model_validate(n) for n in rows],
        total=total,
        page=page,
        limit=limit,
        unread_count=_unread_count(db, user.id),
    )


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NotificationOut:
    note = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id, Notification.user_id == user.id
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Notification not found")

    if note.read_at is None:
        note.read_at = func.now()
        db.commit()
        db.refresh(note)

    return NotificationOut.model_validate(note)


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user.id, Notification.read_at.is_(None))
        .update({Notification.read_at: func.now()}, synchronize_session=False)
    )
    db.commit()
    return {"updated": updated}
