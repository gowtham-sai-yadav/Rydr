from __future__ import annotations

from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User
from app.models.ride import Bike

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_user(db: Session, *, name: str, email: str, phone: str | None, password: str,
                bike_name: str | None, bike_model: str | None, bike_year: int | None) -> User:
    user = User(
        name=name,
        email=email,
        phone=phone,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.flush()

    bike = Bike(user_id=user.id, name=bike_name, model=bike_model, year=bike_year)
    db.add(bike)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user
