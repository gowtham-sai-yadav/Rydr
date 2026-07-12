"""Clubs — persistent joinable groups (a city, a bike brand, a riding
style), separate from one-off group rides. Plus club-scoped leaderboards,
custom badges, and monthly distance challenges.

Surface (all under /api/clubs):
  POST   /                         — create a club (creator becomes admin)
  GET    /                         — list/search clubs
  GET    /{id}                     — detail
  POST   /{id}/join                — join (idempotent)
  DELETE /{id}/join                — leave
  GET    /{id}/members             — member list
  GET    /{id}/leaderboard         — weekly/monthly distance leaderboard, club-scoped
  POST   /{id}/badges              — club admin creates a custom badge
  GET    /{id}/badges              — list the club's custom badges
  POST   /{id}/badges/{badge_id}/award/{user_id} — club admin awards it
  POST   /{id}/challenges          — club admin creates a monthly goal
  GET    /{id}/challenges          — list challenges with live progress
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.club import Club, ClubBadge, ClubChallenge, ClubMembership, ClubRole, UserClubBadge
from app.models.ride import RidePlan
from app.models.ride_log import RideLog
from app.models.user import User
from app.schemas.club import (
    ClubBadgeCreate,
    ClubBadgeOut,
    ClubChallengeCreate,
    ClubChallengeListResponse,
    ClubChallengeOut,
    ClubCreate,
    ClubLeaderboardEntry,
    ClubLeaderboardResponse,
    ClubListResponse,
    ClubMemberListResponse,
    ClubMemberOut,
    ClubOut,
)

router = APIRouter()


def _load_club_or_404(db: Session, club_id: UUID) -> Club:
    club = db.query(Club).filter(Club.id == club_id).first()
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")
    return club


def _to_out(db: Session, club: Club, viewer: Optional[User]) -> ClubOut:
    member_count = db.query(func.count(ClubMembership.id)).filter(ClubMembership.club_id == club.id).scalar() or 0
    my_membership = None
    if viewer is not None:
        my_membership = (
            db.query(ClubMembership)
            .filter(ClubMembership.club_id == club.id, ClubMembership.user_id == viewer.id)
            .first()
        )
    out = ClubOut.model_validate(club)
    out.member_count = int(member_count)
    out.is_member = my_membership is not None
    out.my_role = my_membership.role if my_membership else None
    return out


def _require_club_admin(db: Session, club: Club, user: User) -> None:
    is_admin = (
        db.query(ClubMembership.id)
        .filter(
            ClubMembership.club_id == club.id,
            ClubMembership.user_id == user.id,
            ClubMembership.role == ClubRole.admin,
        )
        .first()
        is not None
    )
    if not is_admin:
        raise HTTPException(status_code=403, detail="Only club admins can do this")


@router.post("", response_model=ClubOut, status_code=201)
def create_club(
    payload: ClubCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClubOut:
    existing = db.query(Club.id).filter(func.lower(Club.name) == payload.name.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="A club with this name already exists")

    club = Club(
        name=payload.name,
        description=payload.description,
        city=payload.city,
        avatar_url=payload.avatar_url,
        created_by_user_id=user.id,
    )
    db.add(club)
    db.flush()
    db.add(ClubMembership(club_id=club.id, user_id=user.id, role=ClubRole.admin))
    db.commit()
    return _to_out(db, club, user)


@router.get("", response_model=ClubListResponse)
def list_clubs(
    city: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None, max_length=150),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
) -> ClubListResponse:
    query = db.query(Club)
    if city:
        query = query.filter(func.lower(Club.city) == city.lower())
    if q:
        query = query.filter(Club.name.ilike(f"%{q}%"))
    total = query.with_entities(func.count()).scalar() or 0
    rows = query.order_by(Club.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return ClubListResponse(
        clubs=[_to_out(db, c, viewer) for c in rows], total=total, page=page, limit=limit
    )


@router.get("/{club_id}", response_model=ClubOut)
def get_club(
    club_id: UUID, db: Session = Depends(get_db), viewer: Optional[User] = Depends(get_optional_user)
) -> ClubOut:
    return _to_out(db, _load_club_or_404(db, club_id), viewer)


@router.post("/{club_id}/join", response_model=ClubOut, status_code=201)
def join_club(
    club_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ClubOut:
    club = _load_club_or_404(db, club_id)
    stmt = (
        pg_insert(ClubMembership)
        .values(club_id=club_id, user_id=user.id, role=ClubRole.member)
        .on_conflict_do_nothing(index_elements=["club_id", "user_id"])
    )
    db.execute(stmt)
    db.commit()
    return _to_out(db, club, user)


@router.delete("/{club_id}/join", status_code=204)
def leave_club(
    club_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    db.query(ClubMembership).filter(
        ClubMembership.club_id == club_id, ClubMembership.user_id == user.id
    ).delete(synchronize_session=False)
    db.commit()
    return Response(status_code=204)


@router.get("/{club_id}/members", response_model=ClubMemberListResponse)
def list_members(club_id: UUID, db: Session = Depends(get_db)) -> ClubMemberListResponse:
    _load_club_or_404(db, club_id)
    rows = (
        db.query(ClubMembership)
        .options(selectinload(ClubMembership.user))
        .filter(ClubMembership.club_id == club_id)
        .order_by(ClubMembership.joined_at.asc())
        .all()
    )
    return ClubMemberListResponse(
        members=[ClubMemberOut(user=m.user, role=m.role, joined_at=m.joined_at) for m in rows]
    )


@router.get("/{club_id}/leaderboard", response_model=ClubLeaderboardResponse)
def club_leaderboard(
    club_id: UUID,
    period: str = Query(default="week", pattern="^(week|month)$"),
    db: Session = Depends(get_db),
) -> ClubLeaderboardResponse:
    """Distance-ridden leaderboard scoped to this club's members, over the
    current week or month — reuses the same distance_km data the global
    leaderboard/PRs draw from, just filtered to club membership + window."""
    _load_club_or_404(db, club_id)
    now = datetime.now(timezone.utc).date()
    window_start = now - timedelta(days=now.weekday()) if period == "week" else now.replace(day=1)

    member_ids = db.query(ClubMembership.user_id).filter(ClubMembership.club_id == club_id).subquery()

    rows = (
        db.query(
            RideLog.rider_id,
            func.coalesce(func.sum(RideLog.distance_km), 0.0).label("distance_km"),
            func.count(RideLog.id).label("ride_count"),
        )
        .join(RidePlan, RidePlan.id == RideLog.ride_plan_id)
        .filter(
            RideLog.rider_id.in_(member_ids.select()),
            RideLog.distance_km.isnot(None),
            RideLog.actual_start_ts >= datetime.combine(window_start, datetime.min.time(), tzinfo=timezone.utc),
        )
        .group_by(RideLog.rider_id)
        .order_by(func.sum(RideLog.distance_km).desc())
        .limit(50)
        .all()
    )

    riders = {u.id: u for u in db.query(User).filter(User.id.in_([r.rider_id for r in rows])).all()}
    entries = [
        ClubLeaderboardEntry(rank=i + 1, user=riders[r.rider_id], distance_km=round(r.distance_km, 1), ride_count=r.ride_count)
        for i, r in enumerate(rows)
        if r.rider_id in riders
    ]
    return ClubLeaderboardResponse(entries=entries, period=period)


@router.post("/{club_id}/badges", response_model=ClubBadgeOut, status_code=201)
def create_club_badge(
    club_id: UUID,
    payload: ClubBadgeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClubBadgeOut:
    club = _load_club_or_404(db, club_id)
    _require_club_admin(db, club, user)
    if db.query(ClubBadge.id).filter(ClubBadge.club_id == club_id, ClubBadge.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="A badge with this slug already exists for this club")
    badge = ClubBadge(club_id=club_id, **payload.model_dump())
    db.add(badge)
    db.commit()
    db.refresh(badge)
    return badge


@router.get("/{club_id}/badges", response_model=list[ClubBadgeOut])
def list_club_badges(club_id: UUID, db: Session = Depends(get_db)) -> list[ClubBadge]:
    _load_club_or_404(db, club_id)
    return db.query(ClubBadge).filter(ClubBadge.club_id == club_id).all()


@router.post("/{club_id}/badges/{badge_id}/award/{user_id}", status_code=204)
def award_club_badge(
    club_id: UUID,
    badge_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    club = _load_club_or_404(db, club_id)
    _require_club_admin(db, club, user)
    badge = db.query(ClubBadge.id).filter(ClubBadge.id == badge_id, ClubBadge.club_id == club_id).first()
    if not badge:
        raise HTTPException(status_code=404, detail="Club badge not found")
    stmt = (
        pg_insert(UserClubBadge)
        .values(user_id=user_id, club_badge_id=badge_id)
        .on_conflict_do_nothing(index_elements=["user_id", "club_badge_id"])
    )
    db.execute(stmt)
    db.commit()
    return Response(status_code=204)


@router.post("/{club_id}/challenges", response_model=ClubChallengeOut, status_code=201)
def create_challenge(
    club_id: UUID,
    payload: ClubChallengeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ClubChallengeOut:
    club = _load_club_or_404(db, club_id)
    _require_club_admin(db, club, user)
    challenge = ClubChallenge(club_id=club_id, **payload.model_dump())
    db.add(challenge)
    db.commit()
    db.refresh(challenge)
    return _challenge_with_progress(db, challenge)


def _challenge_with_progress(db: Session, challenge: ClubChallenge) -> ClubChallengeOut:
    member_ids = db.query(ClubMembership.user_id).filter(ClubMembership.club_id == challenge.club_id).subquery()
    progress = (
        db.query(func.coalesce(func.sum(RideLog.distance_km), 0.0))
        .filter(
            RideLog.rider_id.in_(member_ids.select()),
            RideLog.distance_km.isnot(None),
            RideLog.actual_start_ts >= datetime.combine(challenge.start_date, datetime.min.time(), tzinfo=timezone.utc),
            RideLog.actual_start_ts <= datetime.combine(challenge.end_date, datetime.max.time(), tzinfo=timezone.utc),
        )
        .scalar()
        or 0.0
    )
    out = ClubChallengeOut.model_validate(challenge)
    out.progress_km = round(progress, 1)
    out.is_complete = progress >= challenge.goal_km
    return out


@router.get("/{club_id}/challenges", response_model=ClubChallengeListResponse)
def list_challenges(club_id: UUID, db: Session = Depends(get_db)) -> ClubChallengeListResponse:
    _load_club_or_404(db, club_id)
    challenges = (
        db.query(ClubChallenge).filter(ClubChallenge.club_id == club_id).order_by(ClubChallenge.start_date.desc()).all()
    )
    return ClubChallengeListResponse(challenges=[_challenge_with_progress(db, c) for c in challenges])
