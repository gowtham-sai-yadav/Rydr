"""Auth request/response schemas — extended in M1 with bike mileage + home_location fields."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from app.models.ride import BikeType


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=255)
    phone: Optional[str] = Field(default=None, max_length=20)
    password: str = Field(min_length=8, max_length=128)
    # Bike details (all optional — signup does not require a bike to be fully filled in)
    bike_name: Optional[str] = Field(default=None, max_length=100)
    bike_model: Optional[str] = Field(default=None, max_length=100)
    bike_year: Optional[int] = Field(default=None, ge=1900, le=2100)
    bike_engine_cc: Optional[int] = Field(default=None, ge=0, le=10000)
    bike_mileage_kmpl: Optional[float] = Field(default=None, gt=0, le=200)
    bike_type: Optional[BikeType] = None
    # Home location — optional; user can set later from profile. Bounds match
    # UserUpdate so coords that reach the M2 Haversine filter / cost calculator
    # are always within the valid lat/lng range.
    home_city: Optional[str] = Field(default=None, max_length=100)
    home_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    home_longitude: Optional[float] = Field(default=None, ge=-180, le=180)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
