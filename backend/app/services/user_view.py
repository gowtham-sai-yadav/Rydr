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

from app.models.social import Follow, FollowStatus
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

    # All three counts/flags below only count ACCEPTED follows - a pending
    # request into a private account isn't a real follow yet, so it
    # shouldn't inflate followers_count or unlock is_followed_by_me/DMs.
    followers_count_q = (
        select(func.count(Follow.follower_id))
        .where(Follow.followed_id == User.id, Follow.status == FollowStatus.accepted)
        .correlate(User)
        .scalar_subquery()
    )
    following_count_q = (
        select(func.count(Follow.followed_id))
        .where(Follow.follower_id == User.id, Follow.status == FollowStatus.accepted)
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
                    Follow.status == FollowStatus.accepted,
                )
            )
            .correlate(User)
            .exists()
        )
        # Reverse direction — does this profile follow the viewer back.
        # Informational only now; DM eligibility is one-directional
        # (is_followed_by_me alone), not mutual.
        follows_me_q = (
            select(literal(1))
            .where(
                and_(
                    Follow.follower_id == User.id,
                    Follow.followed_id == viewer_id,
                    Follow.status == FollowStatus.accepted,
                )
            )
            .correlate(User)
            .exists()
        )
        # A follow request I sent to this (private) profile that's still
        # awaiting their acceptance - lets the frontend show "Requested"
        # instead of "Follow" without a second round trip.
        has_pending_request_q = (
            select(literal(1))
            .where(
                and_(
                    Follow.follower_id == viewer_id,
                    Follow.followed_id == User.id,
                    Follow.status == FollowStatus.pending,
                )
            )
            .correlate(User)
            .exists()
        )
    else:
        is_followed_q = literal(False)
        follows_me_q = literal(False)
        has_pending_request_q = literal(False)

    result = (
        db.query(
            User,
            followers_count_q.label("followers_count"),
            following_count_q.label("following_count"),
            is_followed_q.label("is_followed_by_me"),
            follows_me_q.label("follows_me"),
            has_pending_request_q.label("has_pending_follow_request"),
        )
        .options(selectinload(User.bike))
        .filter(User.id == target_user_id)
        .first()
    )
    if result is None:
        raise HTTPException(status_code=404, detail="User not found")

    user, followers_count, following_count, is_followed_by_me, follows_me, has_pending = result
    user.followers_count = int(followers_count or 0)
    user.following_count = int(following_count or 0)
    user.is_followed_by_me = bool(is_followed_by_me)
    user.follows_me = bool(follows_me)
    user.has_pending_follow_request = bool(has_pending)
    return user
