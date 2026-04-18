from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class SignupRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    password: str
    bike_name: Optional[str] = None
    bike_model: Optional[str] = None
    bike_year: Optional[int] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
