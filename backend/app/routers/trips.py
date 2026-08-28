"""Trips — groups a sequence of a rider's own RideLogs into one multi-day
tour with combined distance/day-count stats.

Surface (all under /api/trips):
  POST   /                    — create a trip (empty, days added after)
  GET    /                    — list my trips
  GET    /{id}                — detail with combined stats
  POST   /{id}/days           — add a ride log to the trip at a day index
  DELETE /{id}/days/{ride_log_id} — remove a day
  DELETE /{id}                — delete the trip (ride logs are untouched)
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session, selectinload

from app.dependencies import get_current_user, get_db
from app.models.ride_log import RideLog
from app.models.trip import Trip, TripRideLog
from app.models.user import User
from app.schemas.trip import TripCreate, TripDayOut, TripListResponse, TripOut, TripRideLogAdd

router = APIRouter()


def _load_trip_or_404(db: Session, trip_id: UUID, owner_id: UUID) -> Trip:
    trip = (
        db.query(Trip)
        .options(selectinload(Trip.ride_logs).selectinload(TripRideLog.ride_log).selectinload(RideLog.ride_plan))
        .filter(Trip.id == trip_id, Trip.owner_id == owner_id)
        .first()
    )
    if trip is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


def _to_out(trip: Trip) -> TripOut:
    days = []
    total_distance = 0.0
    for trl in trip.ride_logs:
        log = trl.ride_log
        plan = log.ride_plan if log else None
        if log and log.distance_km:
            total_distance += log.distance_km
        days.append(
            TripDayOut(
                day_index=trl.day_index,
                ride_log_id=trl.ride_log_id,
                ride_plan_id=plan.id if plan else log.ride_plan_id,
                destination_name=plan.destination.name if plan and plan.destination else None,
                distance_km=log.distance_km if log else None,
                actual_start_ts=log.actual_start_ts if log else None,
                thumbnail_url=plan.thumbnail_url if plan else None,
            )
        )
    return TripOut(
        id=trip.id,
        owner_id=trip.owner_id,
        name=trip.name,
        description=trip.description,
        created_at=trip.created_at,
        days=days,
        total_distance_km=round(total_distance, 1),
        total_days=len(days),
    )


@router.post("", response_model=TripOut, status_code=201)
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TripOut:
    trip = Trip(owner_id=user.id, name=payload.name, description=payload.description)
    db.add(trip)
    db.commit()
    db.refresh(trip)
    trip.ride_logs = []
    return _to_out(trip)


@router.get("", response_model=TripListResponse)
def list_my_trips(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TripListResponse:
    trips = (
        db.query(Trip)
        .options(selectinload(Trip.ride_logs).selectinload(TripRideLog.ride_log).selectinload(RideLog.ride_plan))
        .filter(Trip.owner_id == user.id)
        .order_by(Trip.created_at.desc())
        .all()
    )
    return TripListResponse(trips=[_to_out(t) for t in trips])


@router.get("/{trip_id}", response_model=TripOut)
def get_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TripOut:
    return _to_out(_load_trip_or_404(db, trip_id, user.id))


@router.post("/{trip_id}/days", response_model=TripOut, status_code=201)
def add_day(
    trip_id: UUID,
    payload: TripRideLogAdd,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TripOut:
    trip = _load_trip_or_404(db, trip_id, user.id)
    log = db.query(RideLog).filter(RideLog.id == payload.ride_log_id, RideLog.rider_id == user.id).first()
    if log is None:
        raise HTTPException(status_code=404, detail="Ride log not found or not yours")
    existing = db.query(TripRideLog).filter(
        TripRideLog.trip_id == trip_id, TripRideLog.ride_log_id == payload.ride_log_id
    ).first()
    if existing:
        existing.day_index = payload.day_index
    else:
        db.add(TripRideLog(trip_id=trip_id, ride_log_id=payload.ride_log_id, day_index=payload.day_index))
    db.commit()
    return _to_out(_load_trip_or_404(db, trip_id, user.id))


@router.delete("/{trip_id}/days/{ride_log_id}", response_model=TripOut)
def remove_day(
    trip_id: UUID,
    ride_log_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TripOut:
    _load_trip_or_404(db, trip_id, user.id)
    db.query(TripRideLog).filter(
        TripRideLog.trip_id == trip_id, TripRideLog.ride_log_id == ride_log_id
    ).delete(synchronize_session=False)
    db.commit()
    return _to_out(_load_trip_or_404(db, trip_id, user.id))


@router.delete("/{trip_id}", status_code=204)
def delete_trip(
    trip_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    trip = _load_trip_or_404(db, trip_id, user.id)
    db.delete(trip)
    db.commit()
    return Response(status_code=204)
