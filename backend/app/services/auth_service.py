"""Auth service — password hashing, JWT issue, user creation.

Extended in M1 to accept optional bike mileage / type and home_location at signup.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.models.ride import Bike, BikeType
from app.models.user import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


def create_user(
    db: Session,
    *,
    name: str,
    email: str,
    phone: Optional[str],
    password: str,
    bike_name: Optional[str] = None,
    bike_model: Optional[str] = None,
    bike_year: Optional[int] = None,
    bike_engine_cc: Optional[int] = None,
    bike_mileage_kmpl: Optional[float] = None,
    bike_type: Optional[BikeType] = None,
    home_city: Optional[str] = None,
    home_latitude: Optional[float] = None,
    home_longitude: Optional[float] = None,
) -> User:
    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        home_city=home_city,
        home_latitude=home_latitude,
        home_longitude=home_longitude,
    )
    db.add(user)
    db.flush()

    bike = Bike(
        user_id=user.id,
        name=bike_name,
        model=bike_model,
        year=bike_year,
        engine_cc=bike_engine_cc,
        mileage_kmpl=bike_mileage_kmpl,
        type=bike_type or BikeType.any,
    )
    db.add(bike)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
