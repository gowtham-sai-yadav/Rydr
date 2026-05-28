"""Auth router — signup + login. Signup now accepts home_location + bike mileage/type."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, SignupRequest
from app.schemas.user import UserOut
from app.services.auth_service import authenticate_user, create_access_token, create_user
from app.services.user_view import load_user_with_social


def _user_payload(db: Session, user: User) -> dict:
    """Build the auth response's user payload with M6 follow-derived fields
    populated.

    Previously this called ``UserOut.model_validate(user)`` directly on the
    bare ORM instance — which had no ``followers_count`` / ``following_count``
    / ``is_followed_by_me`` attributes attached, so Pydantic fell back to the
    schema defaults (0/0/False). Returning user with 200 followers saw
    "0 followers" until they hit /me. Audit #2.

    Routing through ``load_user_with_social`` makes signup + login
    structurally identical to ``GET /me``.
    """
    enriched = load_user_with_social(db, user.id, viewer=user)
    return UserOut.model_validate(enriched).model_dump(mode="json")


router = APIRouter()


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
    return {"access_token": token, "token_type": "bearer", "user": _user_payload(db, user)}


@router.post("/login", response_model=dict)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": _user_payload(db, user)}
