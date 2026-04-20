"""Users router — /me CRUD + bike + stats + public profile lookup.

Updated in M1 to use the renamed RidePlan / RidePlanParticipant classes and
accept home_location + bike mileage/type fields.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models.ride import (
    Bike,
    ParticipantStatus,
    RidePlan,
    RidePlanParticipant,
    RidePlanStatus,
)
from app.models.user import User
from app.schemas.user import BikeOut, BikeUpdate, UserOut, UserStatsOut, UserUpdate

router = APIRouter()


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.put("/me", response_model=UserOut)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.put("/me/bike", response_model=BikeOut)
def update_bike(
    data: BikeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    bike = db.query(Bike).filter(Bike.user_id == user.id).first()
    if not bike:
        bike = Bike(user_id=user.id)
        db.add(bike)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(bike, field, value)
    db.commit()
    db.refresh(bike)
    return bike


@router.get("/me/stats", response_model=UserStatsOut)
def get_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    captained = db.query(RidePlan).filter(RidePlan.captain_id == user.id).count()
    joined = (
        db.query(RidePlanParticipant)
        .filter(
            RidePlanParticipant.user_id == user.id,
            RidePlanParticipant.status == ParticipantStatus.approved,
        )
        .count()
    )
    completed = (
        db.query(RidePlan)
        .filter(
            RidePlan.captain_id == user.id,
            RidePlan.status == RidePlanStatus.completed,
        )
        .count()
    )
    return UserStatsOut(
        rides_captained=captained,
        rides_joined=joined,
        rides_completed=completed,
    )


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: UUID, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    return u
