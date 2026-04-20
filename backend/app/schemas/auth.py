"""Auth request/response schemas — extended in M1 with bike mileage + home_location fields."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.models.ride import BikeType


class SignupRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    password: str
    # Bike details (all optional — signup does not require a bike to be fully filled in)
    bike_name: Optional[str] = None
    bike_model: Optional[str] = None
    bike_year: Optional[int] = None
    bike_engine_cc: Optional[int] = None
    bike_mileage_kmpl: Optional[float] = None
    bike_type: Optional[BikeType] = None
    # Home location — optional; user can set later from profile
    home_city: Optional[str] = None
    home_latitude: Optional[float] = None
    home_longitude: Optional[float] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
