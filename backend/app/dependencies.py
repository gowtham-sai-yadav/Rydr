from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from app.database import SessionLocal
from app.config import settings
from app.models.user import User
from app.services.auth_service import JWT_ISSUER

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

# M9 audit fix (M2 #10 / M6 #17): require these claims on every token and
# pin the issuer. Tokens missing ``exp`` or ``sub`` were previously accepted
# silently; tokens minted elsewhere with the same algorithm would pass.
_JWT_DECODE_OPTIONS = {"require": ["exp", "sub", "iss"]}


def decode_token(token: str) -> Optional[str]:
    """Decode a JWT and return the subject (user id) or None on failure.

    Centralises the decode path so ``get_current_user`` and
    ``get_optional_user`` can't drift apart on hardening rules.

    Public as of Phase 4 W6: the chat WebSocket authenticates from a query
    parameter rather than an Authorization header, so it cannot go through the
    ``Depends(security)`` path and needs the decode step directly. Sharing this
    function is what keeps the socket's hardening rules — required claims,
    pinned issuer — identical to the REST API's.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            issuer=JWT_ISSUER,
            options=_JWT_DECODE_OPTIONS,
        )
    except JWTError:
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) and sub else None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found"
        )
    return user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Return the current user if a valid token is present, else None.

    Used by M2 GET endpoints (destinations / cost estimate) so they can
    personalize for logged-in users (home location, bike mileage) while
    still serving anonymous browsers. Invalid / missing tokens return None
    rather than 401 — the route handler decides whether to require auth.
    """
    if credentials is None:
        return None
    user_id = decode_token(credentials.credentials)
    if user_id is None:
        return None
    return db.query(User).filter(User.id == user_id).first()


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Gate a route behind the admin flag — Phase 4 W7.

    Returns 403 rather than 404. The 404-to-hide-existence pattern used
    elsewhere in this codebase protects *user content* whose existence is
    itself private; the admin surface is a fixed, documented set of routes
    whose existence is not a secret, and a 403 tells an admin who forgot to
    log in as themselves what actually went wrong.
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires an administrator account",
        )
    return user
