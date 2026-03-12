"""Shared user-fetch helper that populates the follow-derived fields on a
``UserOut``.

Extracted from ``routers/users.py`` per the M6 audit (finding #2) so the auth
router can reuse it for signup/login responses without router-to-router
coupling. Same architectural pattern as ``services/ride_helpers.py``.

Why a service module:
- ``GET /api/users/me``, ``GET /api/users/{id}`` and ``POST /api/auth/{signup,
  login}`` all need to return ``UserOut`` with ``followers_count`` /
  ``following_count`` / ``is_followed_by_me`` populated.
- Previously the helper lived in ``routers/users.py`` and auth.py serialised
  the bare User → all follow fields defaulted to ``0/0/False``. Real bug
  (M6 audit #2) — every session started with stale counts.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, func, literal, select
from sqlalchemy.orm import Session, selectinload

from app.models.social import Follow
from app.models.user import User


def load_user_with_social(
    db: Session, target_user_id: UUID, viewer: Optional[User]
) -> User:
    """Fetch a user with follow-derived fields attached as Python attributes
    so Pydantic's ``from_attributes`` serialiser picks them up.

    Implementation notes:
    - The three derived fields are folded into the main user SELECT as scalar
      subqueries — one round trip for the counts + EXISTS, instead of four
      separate queries.
    - ``User.bike`` is eager-loaded via ``selectinload`` (one extra IN-keyed
      SELECT) rather than ``joinedload``. Audit #3: ``joinedload`` on a
      multi-entity ``db.query(User, scalar, scalar, ...)`` shape can be
      silently ignored by SQLAlchemy 2.0; selectinload is safe regardless
      of relationship cardinality.
    - ``is_followed_by_me`` for ``viewer is None`` returns ``False`` via a
      ``literal(False)`` — no EXISTS subquery emitted.

    Raises ``HTTPException(404)`` when the target user does not exist.
    """
    viewer_id = viewer.id if viewer is not None else None

    followers_count_q = (
        select(func.count(Follow.follower_id))
        .where(Follow.followed_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    following_count_q = (
        select(func.count(Follow.followed_id))
        .where(Follow.follower_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    if viewer_id is not None:
        is_followed_q = (
            select(literal(1))
            .where(
                and_(
                    Follow.follower_id == viewer_id,
                    Follow.followed_id == User.id,
                )
            )
            .correlate(User)
            .exists()
        )
    else:
        is_followed_q = literal(False)

    result = (
        db.query(
            User,
            followers_count_q.label("followers_count"),
            following_count_q.label("following_count"),
            is_followed_q.label("is_followed_by_me"),
        )
        .options(selectinload(User.bike))
        .filter(User.id == target_user_id)
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")

    user, followers_count, following_count, is_followed_by_me = result
    user.followers_count = int(followers_count or 0)
    user.following_count = int(following_count or 0)
    user.is_followed_by_me = bool(is_followed_by_me)
    return user
