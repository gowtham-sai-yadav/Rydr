"""Notification delivery — Phase 4 W5.

Every feature that wants to tell a user something goes through :func:`notify`
or :func:`notify_many`. Callers never construct ``Notification`` rows directly,
so the "don't notify yourself" rule and the failure policy live in one place.

Failure policy
--------------
A notification is a side effect of some more important action: approving a
rider, posting a message, awarding a badge. If delivery fails, the important
action must still succeed. :func:`safe_notify` therefore swallows and logs
exceptions, mirroring ``services/badge_engine.safe_evaluate`` which made the
same call for the same reason in M8.

Swallowing the exception is not sufficient on its own. A failed ``flush``
leaves the SQLAlchemy session in a "needs rollback" state, so the *next*
statement the caller issues — including its own ``commit`` — raises
``PendingRollbackError``. Catching the error while leaving the session
poisoned would mean the notification failure still took down the ride
approval, which is exactly what these wrappers exist to prevent.

Each ``safe_`` call therefore runs inside a SAVEPOINT (``begin_nested``).
A failure rolls back only to the savepoint; the work the caller did before it
survives and the session stays usable. Routers use the ``safe_`` variants.

Transaction policy
------------------
:func:`notify` adds rows and flushes but does not commit — the notification
lands in the caller's transaction, so it is written if and only if the action
that triggered it is. Callers that want a standalone commit use
:func:`safe_notify_commit`.
"""
from __future__ import annotations

import logging
from typing import Iterable, List, Optional, Sequence
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import EntityType, Notification, NotificationType
from app.services.push_service import send_push

logger = logging.getLogger(__name__)


def notify(
    db: Session,
    *,
    user_id: UUID,
    type: NotificationType,
    title: str,
    body: Optional[str] = None,
    actor_id: Optional[UUID] = None,
    entity_type: Optional[EntityType] = None,
    entity_id: Optional[UUID] = None,
) -> Optional[Notification]:
    """Queue one notification inside the caller's transaction.

    Returns ``None`` without writing anything when the actor is also the
    recipient. Nobody needs to be told they liked their own post, and pushing
    that rule down here means no caller has to remember it.
    """
    if actor_id is not None and actor_id == user_id:
        return None

    row = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=type.value,
        title=title[:200],
        body=body,
        entity_type=entity_type.value if entity_type else None,
        entity_id=entity_id,
    )
    db.add(row)
    db.flush()
    # Best-effort, same tolerance as the row write itself - a push firing
    # for a row whose surrounding transaction later rolls back is a rare,
    # harmless false notification, not a data-integrity concern.
    send_push(db, user_id=user_id, title=title, body=body or "")
    return row


def notify_many(
    db: Session,
    *,
    user_ids: Iterable[UUID],
    type: NotificationType,
    title: str,
    body: Optional[str] = None,
    actor_id: Optional[UUID] = None,
    entity_type: Optional[EntityType] = None,
    entity_id: Optional[UUID] = None,
) -> List[Notification]:
    """Fan one notification out to many recipients.

    De-duplicates the recipient list so a user who appears twice (approved
    participant *and* captain, say) is only notified once.
    """
    seen: set[UUID] = set()
    made: List[Notification] = []
    for uid in user_ids:
        if uid in seen:
            continue
        seen.add(uid)
        row = notify(
            db,
            user_id=uid,
            type=type,
            title=title,
            body=body,
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
        if row is not None:
            made.append(row)
    return made


def safe_notify(db: Session, **kwargs) -> Optional[Notification]:
    """:func:`notify`, but a failure is logged instead of raised.

    Runs in a SAVEPOINT so a failure cannot poison the caller's transaction.
    """
    try:
        with db.begin_nested():
            return notify(db, **kwargs)
    except Exception:  # pragma: no cover - defensive
        logger.exception("notification delivery failed", extra={"kwargs": kwargs})
        return None


def safe_notify_many(db: Session, **kwargs) -> List[Notification]:
    """:func:`notify_many`, but a failure is logged instead of raised.

    Runs in a SAVEPOINT so a failure cannot poison the caller's transaction.
    The fan-out is all-or-nothing: one bad recipient rolls the batch back
    rather than leaving some recipients notified and others not.
    """
    try:
        with db.begin_nested():
            return notify_many(db, **kwargs)
    except Exception:  # pragma: no cover - defensive
        logger.exception("fan-out notification failed", extra={"kwargs": kwargs})
        return []


def safe_notify_commit(db: Session, **kwargs) -> Optional[Notification]:
    """Deliver and commit immediately.

    For callers that have already committed the triggering action and want the
    notification durable on its own. A failure rolls back only the
    notification.
    """
    try:
        with db.begin_nested():
            row = notify(db, **kwargs)
        db.commit()
        return row
    except Exception:  # pragma: no cover - defensive
        logger.exception("notification commit failed", extra={"kwargs": kwargs})
        db.rollback()
        return None


def unread_count(db: Session, user_id: UUID) -> int:
    from sqlalchemy import func

    return (
        db.query(func.count(Notification.id))
        .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
        .scalar()
        or 0
    )
