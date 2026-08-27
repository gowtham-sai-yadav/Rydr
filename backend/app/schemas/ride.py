"""Pydantic schemas for RidePlan + RidePlanParticipant.

Extended in M3 with:
  - ``RidePlanSummary`` / ``RidePlanListResponse`` for feed
  - ``MineRideOut`` / ``MineRidesResponse`` with role discriminator
  - ``ParticipantListResponse`` paginated
  - ``RidePlanCreate.planned_date`` validator (today or future)
  - ``RidePlanOut.chat_group_id`` (None for solo rides)
  - timestamps on ``RidePlanParticipantOut`` (M3 migration adds the columns)

``UserBrief`` lives in ``schemas/user`` since the M2 audit fix; imported here
only for use in the schemas defined in this module.
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.models.ride import (
    DifficultyLevel,
    ParticipantStatus,
    RidePlanStatus,
    RidePlanVisibility,
)
from app.schemas.destination import DestinationSummary
from app.schemas.user import UserBrief


class RidePlanParticipantOut(BaseModel):
    id: UUID
    ride_plan_id: UUID
    user_id: UUID
    status: ParticipantStatus
    created_at: datetime
    updated_at: datetime
    user: Optional[UserBrief] = None

    class Config:
        from_attributes = True


class ParticipantListResponse(BaseModel):
    participants: List[RidePlanParticipantOut] = []
    total: int
    page: int
    limit: int


class RidePlanCreate(BaseModel):
    destination_id: UUID
    route_id: Optional[UUID] = None
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    planned_date: date
    planned_start_time: time
    estimated_end_time: Optional[time] = None
    visibility: RidePlanVisibility = RidePlanVisibility.group
    difficulty_level: DifficultyLevel = DifficultyLevel.moderate
    recommended_bike_type: Optional[str] = Field(default=None, max_length=100)
    break_schedule: Optional[str] = Field(default=None, max_length=2000)
    max_riders: int = Field(default=10, ge=1, le=50)

    @field_validator("planned_date")
    @classmethod
    def _planned_date_not_past(cls, v: date) -> date:
        # Today is OK; yesterday is not. Past trips become RideLogs (M4 flow).
        if v < date.today():
            raise ValueError("planned_date must be today or future")
        return v


class RidePlanUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    thumbnail_url: Optional[str] = Field(default=None, max_length=500)
    planned_date: Optional[date] = None
    planned_start_time: Optional[time] = None
    estimated_end_time: Optional[time] = None
    difficulty_level: Optional[DifficultyLevel] = None
    recommended_bike_type: Optional[str] = Field(default=None, max_length=100)
    break_schedule: Optional[str] = Field(default=None, max_length=2000)
    max_riders: Optional[int] = Field(default=None, ge=1, le=50)

    @field_validator("planned_date")
    @classmethod
    def _planned_date_not_past(cls, v: Optional[date]) -> Optional[date]:
        if v is not None and v < date.today():
            raise ValueError("planned_date must be today or future")
        return v


class RidePlanSummary(BaseModel):
    """Lightweight shape for feed / mine — no participants array."""

    id: UUID
    title: str
    thumbnail_url: Optional[str] = None
    destination: Optional[DestinationSummary] = None
    captain: Optional[UserBrief] = None
    planned_date: date
    planned_start_time: time
    visibility: RidePlanVisibility
    difficulty_level: DifficultyLevel
    status: RidePlanStatus
    max_riders: int
    participant_count: int = 0


class RidePlanListResponse(BaseModel):
    rides: List[RidePlanSummary] = []
    total: int
    page: int
    limit: int


class MineRideOut(RidePlanSummary):
    role: Literal["captain", "participant"]
    my_participant_status: Optional[ParticipantStatus] = None


class MineRidesResponse(BaseModel):
    rides: List[MineRideOut] = []
    total: int
    page: int
    limit: int


class RidePlanOut(BaseModel):
    id: UUID
    destination_id: UUID
    route_id: Optional[UUID] = None
    captain_id: UUID
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    planned_date: date
    planned_start_time: time
    estimated_end_time: Optional[time] = None
    visibility: RidePlanVisibility
    difficulty_level: DifficultyLevel
    recommended_bike_type: Optional[str] = None
    break_schedule: Optional[str] = None
    max_riders: int
    status: RidePlanStatus
    created_at: datetime
    updated_at: datetime
    chat_group_id: Optional[UUID] = None
    # Phase 4 W6 capacity signals. ``participant_count`` is the approved
    # count (seats taken); these two save the client from having to know
    # that max_riders includes the captain in order to render "2 seats left".
    seats_available: int = 0
    waitlist_count: int = 0
    destination: Optional[DestinationSummary] = None
    captain: Optional[UserBrief] = None
    participants: List[RidePlanParticipantOut] = []
    participant_count: int = 0


class ParticipantStatusUpdate(BaseModel):
    status: ParticipantStatus

    @field_validator("status")
    @classmethod
    def _captain_actions_only(cls, v: ParticipantStatus) -> ParticipantStatus:
        # The captain-facing update endpoint can only set approved/rejected/
        # waitlisted. `pending` is the join state; `left` is the
        # participant-facing leave.
        #
        # Phase 4 W6 added `waitlisted` so a captain can accept a rider into
        # the queue of a full ride deliberately. Approving into a full ride is
        # a 409 rather than a silent downgrade to waitlisted, so the captain
        # always knows which of the two happened.
        if v not in {
            ParticipantStatus.approved,
            ParticipantStatus.rejected,
            ParticipantStatus.waitlisted,
        }:
            raise ValueError(
                "captain can only set status to 'approved', 'rejected' "
                "or 'waitlisted'"
            )
        return v
