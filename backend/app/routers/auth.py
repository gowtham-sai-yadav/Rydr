from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse
from app.schemas.user import UserOut
from app.services.auth_service import create_user, authenticate_user, create_access_token
from app.models.user import User

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
    )
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user).model_dump()}


@router.post("/login", response_model=dict)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": UserOut.model_validate(user).model_dump()}
