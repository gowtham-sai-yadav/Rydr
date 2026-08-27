import logging

from fastapi import Depends, FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.observability import RequestLogMiddleware, configure_logging
from app.routers import (
    auth,
    badges,
    chat,
    destinations,
    leaderboards,
    maps,
    notifications,
    posts,
    reports,
    ride_logs,
    rides,
    share_cards,
    tags,
    users,
)

configure_logging(settings.LOG_LEVEL)

app = FastAPI(title="Ryder API", version="1.0.0")

# Registered before CORS so it observes every request, including the ones
# CORS rejects — a request blocked by CORS is exactly the kind you want in
# the log when a deploy has the wrong ALLOWED_ORIGINS.
app.add_middleware(RequestLogMiddleware)

# M9 audit fix (M2 #14): read CORS origins from settings instead of
# hardcoding localhost:3000. Production deploys set ALLOWED_ORIGINS to
# their real frontend host(s); local dev keeps the default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(users.router, prefix="/api/users", tags=["Users"])
app.include_router(destinations.router, prefix="/api/destinations", tags=["Destinations"])
app.include_router(tags.router, prefix="/api/tags", tags=["Tags"])
app.include_router(rides.router, prefix="/api/rides", tags=["Rides"])
app.include_router(ride_logs.router, prefix="/api/ride-logs", tags=["RideLogs"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(badges.router, prefix="/api/badges", tags=["Badges"])
app.include_router(
    notifications.router, prefix="/api/notifications", tags=["Notifications"]
)
app.include_router(posts.router, prefix="/api/posts", tags=["Feed"])
app.include_router(
    leaderboards.router, prefix="/api/leaderboards", tags=["Leaderboards"]
)
app.include_router(
    share_cards.router, prefix="/api/share-cards", tags=["ShareCards"]
)
app.include_router(maps.router, prefix="/api/maps", tags=["Maps"])
app.include_router(reports.router, prefix="/api/reports", tags=["Moderation"])


@app.get("/api/health")
def health():
    """Liveness. Answers "is this process running", nothing more.

    Deliberately touches no dependency: an orchestrator uses liveness to
    decide whether to restart the container, and restarting the API because
    the database is briefly unreachable turns a database blip into an outage.
    """
    return {"status": "ok"}


@app.get("/api/health/ready")
def readiness(response: Response, db: Session = Depends(get_db)):
    """Readiness. Answers "can this instance serve traffic".

    Checks the database, because an API that cannot reach Postgres can serve
    almost nothing. Returns 503 on failure so a load balancer takes the
    instance out of rotation rather than sending it requests that will 500.
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001 — the reason is the payload
        logging.getLogger("rydr.health").warning("readiness failed: %s", exc)
        response.status_code = 503
        return {"status": "unavailable", "database": "unreachable"}
    return {"status": "ok", "database": "ok"}
