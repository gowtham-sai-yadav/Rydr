from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, subqueryload
from uuid import UUID

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.ride import Ride, RideStop, RideParticipant, RideStatus, ParticipantStatus
from app.models.chat import ChatGroup
from app.schemas.ride import RideCreate, RideUpdate, RideOut, ParticipantOut, ParticipantStatusUpdate, RideStopOut
from app.schemas.user import UserOut

router = APIRouter()


def ride_to_out(ride: Ride) -> dict:
    approved = [p for p in ride.participants if p.status == ParticipantStatus.approved]
    return {
        **{c.key: getattr(ride, c.key) for c in ride.__table__.columns},
        "difficulty_level": ride.difficulty_level.value if ride.difficulty_level else "moderate",
        "status": ride.status.value if ride.status else "open",
        "captain": {"id": ride.captain.id, "name": ride.captain.name, "avatar_url": ride.captain.avatar_url} if ride.captain else None,
        "stops": [{"id": s.id, "ride_id": s.ride_id, "name": s.name, "description": s.description,
                    "stop_order": s.stop_order, "latitude": s.latitude, "longitude": s.longitude,
                    "is_break_stop": s.is_break_stop} for s in ride.stops],
        "participants": [{"id": p.id, "ride_id": p.ride_id, "user_id": p.user_id,
                          "status": p.status.value if p.status else "pending",
                          "user": {"id": p.user.id, "name": p.user.name, "avatar_url": p.user.avatar_url} if p.user else None}
                         for p in ride.participants],
        "participant_count": len(approved),
    }


@router.get("/feed")
def ride_feed(page: int = Query(1, ge=1), limit: int = Query(12, ge=1, le=50),
              db: Session = Depends(get_db)):
    q = db.query(Ride).options(
        subqueryload(Ride.captain), subqueryload(Ride.stops), subqueryload(Ride.participants).subqueryload(RideParticipant.user)
    ).filter(Ride.status == RideStatus.open).order_by(Ride.ride_date.desc())
    total = db.query(Ride).filter(Ride.status == RideStatus.open).count()
    rides = q.offset((page - 1) * limit).limit(limit).all()
    return {"rides": [ride_to_out(r) for r in rides], "total": total, "page": page}


@router.get("/mine")
def my_rides(status: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Ride).options(
        subqueryload(Ride.captain), subqueryload(Ride.stops), subqueryload(Ride.participants).subqueryload(RideParticipant.user)
    ).filter(
        (Ride.captain_id == user.id) |
        (Ride.participants.any(RideParticipant.user_id == user.id))
    )
    if status:
        q = q.filter(Ride.status == RideStatus(status))
    rides = q.order_by(Ride.ride_date.desc()).all()
    return {"rides": [ride_to_out(r) for r in rides]}


@router.post("/", status_code=201)
def create_ride(data: RideCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = Ride(
        captain_id=user.id,
        title=data.title,
        description=data.description,
        thumbnail_url=data.thumbnail_url,
        ride_date=data.ride_date,
        start_time=data.start_time,
        estimated_end_time=data.estimated_end_time,
        difficulty_level=data.difficulty_level,
        recommended_bike_type=data.recommended_bike_type,
        break_schedule=data.break_schedule,
        max_riders=data.max_riders,
    )
    db.add(ride)
    db.flush()

    for s in data.stops:
        stop = RideStop(ride_id=ride.id, name=s.name, description=s.description,
                        stop_order=s.stop_order, latitude=s.latitude, longitude=s.longitude,
                        is_break_stop=s.is_break_stop)
        db.add(stop)

    chat = ChatGroup(ride_id=ride.id, name=data.title)
    db.add(chat)

    db.commit()
    db.refresh(ride)
    return ride_to_out(ride)


@router.get("/{ride_id}")
def get_ride(ride_id: UUID, db: Session = Depends(get_db)):
    ride = db.query(Ride).options(
        subqueryload(Ride.captain), subqueryload(Ride.stops), subqueryload(Ride.participants).subqueryload(RideParticipant.user)
    ).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    return ride_to_out(ride)


@router.put("/{ride_id}")
def update_ride(ride_id: UUID, data: RideUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can update this ride")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ride, field, value)
    db.commit()
    db.refresh(ride)
    return ride_to_out(ride)


@router.delete("/{ride_id}")
def delete_ride(ride_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can cancel this ride")
    ride.status = RideStatus.cancelled
    db.commit()
    return {"detail": "Ride cancelled"}


@router.post("/{ride_id}/join")
def join_ride(ride_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id == user.id:
        raise HTTPException(status_code=400, detail="Captain cannot join their own ride")

    existing = db.query(RideParticipant).filter(
        RideParticipant.ride_id == ride_id, RideParticipant.user_id == user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already requested to join")

    approved_count = db.query(RideParticipant).filter(
        RideParticipant.ride_id == ride_id, RideParticipant.status == ParticipantStatus.approved
    ).count()
    if approved_count >= ride.max_riders:
        raise HTTPException(status_code=400, detail="Ride is full")

    p = RideParticipant(ride_id=ride_id, user_id=user.id, status=ParticipantStatus.pending)
    db.add(p)
    db.commit()
    return {"detail": "Join request sent", "status": "pending"}


@router.get("/{ride_id}/participants")
def get_participants(ride_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can view participants")
    participants = db.query(RideParticipant).options(
        subqueryload(RideParticipant.user)
    ).filter(RideParticipant.ride_id == ride_id).all()
    return [{"id": p.id, "ride_id": p.ride_id, "user_id": p.user_id,
             "status": p.status.value, "user": {"id": p.user.id, "name": p.user.name, "avatar_url": p.user.avatar_url}}
            for p in participants]


@router.put("/{ride_id}/participants/{user_id}")
def update_participant(ride_id: UUID, user_id: UUID, data: ParticipantStatusUpdate,
                       db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ride = db.query(Ride).filter(Ride.id == ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Ride not found")
    if ride.captain_id != user.id:
        raise HTTPException(status_code=403, detail="Only the captain can manage participants")

    p = db.query(RideParticipant).filter(
        RideParticipant.ride_id == ride_id, RideParticipant.user_id == user_id
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    p.status = ParticipantStatus(data.status)
    db.commit()
    return {"detail": f"Participant {data.status}"}
