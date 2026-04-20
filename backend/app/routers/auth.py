"""Auth router — signup + login. Signup now accepts home_location + bike mileage/type."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest
from app.schemas.user import UserOut
from app.services.auth_service import authenticate_user, create_access_token, create_user

router = APIRouter()


def _user_payload(user: User) -> dict:
    return UserOut.model_validate(user).model_dump(mode="json")


@router.post("/signup", response_model=dict)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = create_user(
        db,
        name=req.name,
        email=req.email,
        phone=req.phone,
        password=req.password,
        bike_name=req.bike_name,
        bike_model=req.bike_model,
        bike_year=req.bike_year,
        bike_engine_cc=req.bike_engine_cc,
        bike_mileage_kmpl=req.bike_mileage_kmpl,
        bike_type=req.bike_type,
        home_city=req.home_city,
        home_latitude=req.home_latitude,
        home_longitude=req.home_longitude,
    )
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": _user_payload(user)}


@router.post("/login", response_model=dict)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": _user_payload(user)}
