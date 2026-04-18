from __future__ import annotations

from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID

from app.dependencies import get_db, get_current_user
from app.models.user import User
from app.models.ride import RideParticipant, Ride
from app.models.chat import ChatGroup
from app.schemas.chat import ChatGroupOut, ChatMessageOut

router = APIRouter()

MOCK_MESSAGES = [
    {"id": "1", "sender_name": "Alex Rider", "sender_avatar": None, "content": "Hey everyone! Excited for the ride this weekend!", "timestamp": "2024-03-01T10:00:00Z", "is_mine": False},
    {"id": "2", "sender_name": "You", "sender_avatar": None, "content": "Same here! What time are we meeting?", "timestamp": "2024-03-01T10:05:00Z", "is_mine": True},
    {"id": "3", "sender_name": "Sam Cruz", "sender_avatar": None, "content": "Let's aim for 7 AM at the starting point. Early start to beat traffic.", "timestamp": "2024-03-01T10:10:00Z", "is_mine": False},
    {"id": "4", "sender_name": "Alex Rider", "sender_avatar": None, "content": "Sounds good! Don't forget to check tire pressure before heading out.", "timestamp": "2024-03-01T10:15:00Z", "is_mine": False},
    {"id": "5", "sender_name": "You", "sender_avatar": None, "content": "Will do. Should we bring extra water for the break stops?", "timestamp": "2024-03-01T10:20:00Z", "is_mine": True},
    {"id": "6", "sender_name": "Sam Cruz", "sender_avatar": None, "content": "Definitely. It's going to be warm. I'll bring a cooler.", "timestamp": "2024-03-01T10:25:00Z", "is_mine": False},
]


@router.get("/groups", response_model=List[ChatGroupOut])
def get_groups(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    # Get groups for rides where user is captain or approved participant
    captain_rides = db.query(Ride.id).filter(Ride.captain_id == user.id).subquery()
    participant_rides = db.query(RideParticipant.ride_id).filter(
        RideParticipant.user_id == user.id
    ).subquery()

    groups = db.query(ChatGroup).filter(
        (ChatGroup.ride_id.in_(captain_rides)) | (ChatGroup.ride_id.in_(participant_rides))
    ).all()
    return groups


@router.get("/groups/{group_id}/messages", response_model=List[ChatMessageOut])
def get_messages(group_id: UUID, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    group = db.query(ChatGroup).filter(ChatGroup.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Chat group not found")
    return MOCK_MESSAGES
