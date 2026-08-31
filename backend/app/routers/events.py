"""Events — organized public rides/meetups with RSVP, a date, and a
meeting point. Open RSVP (no captain-approval flow, unlike RidePlan) and
can be club-scoped or open to anyone.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db, get_optional_user
from app.models.event import Event, EventRSVP, RSVPStatus
from app.models.user import User
from app.schemas.event import (
    EventCreate,
    EventListResponse,
    EventOut,
    EventRSVPCreate,
    EventRSVPListResponse,
    EventRSVPOut,
)

router = APIRouter()


def _load_event_or_404(db: Session, event_id: UUID) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def _to_out(db: Session, event: Event, viewer: Optional[User]) -> EventOut:
    going = (
        db.query(func.count(EventRSVP.id))
        .filter(EventRSVP.event_id == event.id, EventRSVP.status == RSVPStatus.going)
        .scalar()
        or 0
    )
    interested = (
        db.query(func.count(EventRSVP.id))
        .filter(EventRSVP.event_id == event.id, EventRSVP.status == RSVPStatus.interested)
        .scalar()
        or 0
    )
    my_rsvp = None
    if viewer is not None:
        row = db.query(EventRSVP.status).filter(EventRSVP.event_id == event.id, EventRSVP.user_id == viewer.id).first()
        my_rsvp = row[0] if row else None
    out = EventOut.model_validate(event)
    out.going_count = int(going)
    out.interested_count = int(interested)
    out.my_rsvp = my_rsvp
    return out


@router.post("", response_model=EventOut, status_code=201)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventOut:
    event = Event(**payload.model_dump(), created_by_user_id=user.id)
    db.add(event)
    db.flush()
    # Creator is auto-going — same convention as a ride captain auto-joining.
    db.add(EventRSVP(event_id=event.id, user_id=user.id, status=RSVPStatus.going))
    db.commit()
    return _to_out(db, event, user)


@router.get("", response_model=EventListResponse)
def list_events(
    club_id: Optional[UUID] = Query(default=None),
    upcoming_only: bool = Query(default=True),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
    viewer: Optional[User] = Depends(get_optional_user),
) -> EventListResponse:
    query = db.query(Event)
    if club_id is not None:
        query = query.filter(Event.club_id == club_id)
    if upcoming_only:
        query = query.filter(Event.event_date >= datetime.now(timezone.utc))
    total = query.with_entities(func.count(Event.id)).scalar() or 0
    rows = query.order_by(Event.event_date.asc()).offset((page - 1) * limit).limit(limit).all()
    return EventListResponse(
        events=[_to_out(db, e, viewer) for e in rows], total=total, page=page, limit=limit
    )


@router.get("/{event_id}", response_model=EventOut)
def get_event(
    event_id: UUID, db: Session = Depends(get_db), viewer: Optional[User] = Depends(get_optional_user)
) -> EventOut:
    return _to_out(db, _load_event_or_404(db, event_id), viewer)


@router.put("/{event_id}/rsvp", response_model=EventOut)
def set_rsvp(
    event_id: UUID,
    payload: EventRSVPCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventOut:
    event = _load_event_or_404(db, event_id)
    stmt = (
        pg_insert(EventRSVP)
        .values(event_id=event_id, user_id=user.id, status=payload.status)
        .on_conflict_do_update(
            index_elements=["event_id", "user_id"], set_={"status": payload.status}
        )
    )
    db.execute(stmt)
    db.commit()
    return _to_out(db, event, user)


@router.delete("/{event_id}/rsvp", status_code=204)
def cancel_rsvp(
    event_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    db.query(EventRSVP).filter(EventRSVP.event_id == event_id, EventRSVP.user_id == user.id).delete(
        synchronize_session=False
    )
    db.commit()
    return Response(status_code=204)


@router.get("/{event_id}/rsvps", response_model=EventRSVPListResponse)
def list_rsvps(event_id: UUID, db: Session = Depends(get_db)) -> EventRSVPListResponse:
    _load_event_or_404(db, event_id)
    rows = (
        db.query(EventRSVP)
        .options(selectinload(EventRSVP.user))
        .filter(EventRSVP.event_id == event_id)
        .order_by(EventRSVP.created_at.asc())
        .all()
    )
    return EventRSVPListResponse(
        rsvps=[EventRSVPOut(user=r.user, status=r.status, created_at=r.created_at) for r in rows]
    )
