"""Ride planning router — STUBBED for M1.

The full implementation lands in M3 (ride planning against destinations).
Endpoints here keep the surface alive so the frontend doesn't crash on requests.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

M3_PENDING = "Ride planning is being rebuilt in M3 — endpoint not yet available."


@router.get("/feed")
def ride_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(12, ge=1, le=50),
):
    """Empty feed during the M1 → M3 transition."""
    _ = limit  # intentionally unused while stubbed
    return {"rides": [], "total": 0, "page": page}


@router.get("/mine")
def my_rides(
    status: str | None = None,
    user: User = Depends(get_current_user),
):
    _ = status
    _ = user
    return {"rides": []}


@router.post("/", status_code=501)
def create_ride():
    raise HTTPException(status_code=501, detail=M3_PENDING)


@router.get("/{ride_id}")
def get_ride(ride_id: UUID):
    _ = ride_id
    raise HTTPException(status_code=404, detail="Ride not found")


@router.put("/{ride_id}", status_code=501)
def update_ride(ride_id: UUID):
    _ = ride_id
    raise HTTPException(status_code=501, detail=M3_PENDING)


@router.delete("/{ride_id}", status_code=501)
def delete_ride(ride_id: UUID):
    _ = ride_id
    raise HTTPException(status_code=501, detail=M3_PENDING)


@router.post("/{ride_id}/join", status_code=501)
def join_ride(ride_id: UUID):
    _ = ride_id
    raise HTTPException(status_code=501, detail=M3_PENDING)


@router.get("/{ride_id}/participants", status_code=501)
def get_participants(ride_id: UUID):
    _ = ride_id
    raise HTTPException(status_code=501, detail=M3_PENDING)


@router.put("/{ride_id}/participants/{user_id}", status_code=501)
def update_participant(ride_id: UUID, user_id: UUID):
    _ = ride_id
    _ = user_id
    raise HTTPException(status_code=501, detail=M3_PENDING)
