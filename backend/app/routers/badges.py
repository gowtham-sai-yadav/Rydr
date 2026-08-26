"""Badges router (M8).

Three read-only endpoints — the catalog (anyone), my badges (auth),
and a public lookup by user id (anyone). Awarding is a side effect of
ride completion / log creation / participant approval, handled by
``services.badge_engine``; there is no "award badge" endpoint on
purpose. The catalog is fixed at deploy time (Alembic migration +
``scripts/seed_badges.py``); there is no admin endpoint to mutate it.

Design notes
------------
- ``GET /api/badges`` returns ALL catalog entries even if the user has
  earned none — the frontend renders the catalog as a checklist so the
  user can see what they're working toward. Locked vs unlocked is the
  caller's concern.
- ``GET /api/users/{id}/badges`` returns only earned awards, with the
  catalog row nested. 404 if the user doesn't exist (consistent with
  the rest of ``/api/users/{id}/*``).
- We eager-load ``UserBadge.badge`` so the nested ``BadgeOut`` is
  populated without a per-row roundtrip.
- Order: most-recent earned first, so the profile shelf shows fresh
  achievements at the top.
"""
from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db
from app.models.badge import Badge, UserBadge
from app.models.user import User
from app.schemas.badge import BadgeOut, UserBadgeOut
from app.services.card_renderer import render_card


router = APIRouter()


@router.get("", response_model=List[BadgeOut])
def list_catalog(db: Session = Depends(get_db)) -> List[BadgeOut]:
    """Return the full badge catalog. Ordered by slug so the response
    is stable across deploys (icons / names can change but slugs are
    the contract)."""
    rows = db.query(Badge).order_by(Badge.slug.asc()).all()
    return [BadgeOut.model_validate(r) for r in rows]


@router.get("/me", response_model=List[UserBadgeOut])
def list_my_badges(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[UserBadgeOut]:
    """Badges earned by the calling user. Most-recent first."""
    rows = (
        db.query(UserBadge)
        .options(selectinload(UserBadge.badge))
        .filter(UserBadge.user_id == user.id)
        .order_by(UserBadge.earned_at.desc())
        .all()
    )
    return [UserBadgeOut.model_validate(r) for r in rows]


@router.get("/{badge_id}/card")
def get_badge_card(
    badge_id: UUID,
    db: Session = Depends(get_db),
) -> Response:
    """Shareable PNG for one earned badge (Phase 4).

    ``badge_id`` here is a ``UserBadge`` (award) id, not a catalog
    ``Badge`` id - the card needs to show *who* earned it, which only the
    award row (not the catalog row) knows. Public, no auth required,
    matching the rest of the badge surface's visibility.
    """
    award = (
        db.query(UserBadge)
        .options(selectinload(UserBadge.badge), selectinload(UserBadge.user))
        .filter(UserBadge.id == badge_id)
        .first()
    )
    if not award:
        raise HTTPException(status_code=404, detail="Badge award not found")

    badge_name = award.badge.name if award.badge else "Rydr Badge"
    badge_description = award.badge.description if award.badge else None
    rider_name = award.user.name if award.user else "A Rydr rider"

    lines = [badge_description] if badge_description else []
    png_bytes = render_card(
        title=badge_name,
        subtitle=f"Earned by {rider_name}",
        lines=lines,
        accent_label="BADGE EARNED",
    )
    return Response(content=png_bytes, media_type="image/png")


@router.get("/users/{user_id}", response_model=List[UserBadgeOut])
def list_user_badges(
    user_id: UUID,
    db: Session = Depends(get_db),
) -> List[UserBadgeOut]:
    """Badges earned by any user. Public — visibility matches the rest
    of the profile surface (followers, following, stats are all public).

    Returns 404 when the user doesn't exist, mirroring the contract of
    ``GET /api/users/{id}`` so the frontend can treat them uniformly.
    """
    user_exists = db.query(User.id).filter(User.id == user_id).first()
    if not user_exists:
        raise HTTPException(status_code=404, detail="User not found")

    rows = (
        db.query(UserBadge)
        .options(selectinload(UserBadge.badge))
        .filter(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.desc())
        .all()
    )
    return [UserBadgeOut.model_validate(r) for r in rows]
