"""Notification creation helper - shared by every trigger site.

Centralising this in one function (rather than constructing ``Notification``
rows inline at each call site) keeps the message-formatting conventions
consistent and gives us one place to make notification writes best-effort
(a failure here should never fail the parent action, same rationale as
``badge_engine.safe_evaluate``).
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification, NotificationType


def create_notification(
    db: Session,
    *,
    user_id: UUID,
    type: NotificationType,
    message: str,
    actor_id: Optional[UUID] = None,
    ride_plan_id: Optional[UUID] = None,
    post_id: Optional[UUID] = None,
    badge_id: Optional[UUID] = None,
) -> Optional[Notification]:
    """Insert a notification row. Does not commit - call sites fold this
    into their existing transaction so the notification and the action
    that triggered it succeed or fail together.

    Skips self-notification (actor_id == user_id) since that's never a
    meaningful signal ("you liked your own post").
    """
    if actor_id is not None and actor_id == user_id:
        return None

    note = Notification(
        user_id=user_id,
        type=type,
        actor_id=actor_id,
        ride_plan_id=ride_plan_id,
        post_id=post_id,
        badge_id=badge_id,
        message=message,
    )
    db.add(note)
    return note


def safe_notify(
    db: Session,
    *,
    user_id: UUID,
    type: NotificationType,
    message: str,
    actor_id: Optional[UUID] = None,
    ride_plan_id: Optional[UUID] = None,
    post_id: Optional[UUID] = None,
    badge_id: Optional[UUID] = None,
) -> None:
    """Fire-and-forget wrapper for trigger sites that already committed
    their primary write (e.g. the badge engine, which commits inside its
    own function). Swallows errors so a notification failure never
    surfaces as a failure of the action that earned it.
    """
    try:
        create_notification(
            db,
            user_id=user_id,
            type=type,
            message=message,
            actor_id=actor_id,
            ride_plan_id=ride_plan_id,
            post_id=post_id,
            badge_id=badge_id,
        )
        db.commit()
    except Exception:  # noqa: BLE001 - intentional swallow for side-effect
        db.rollback()
