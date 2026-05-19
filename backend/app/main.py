from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    badges,
    chat,
    destinations,
    feed,
    leaderboard,
    ride_logs,
    rides,
    tags,
    users,
)

app = FastAPI(title="Ryder API", version="1.0.0")

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
app.include_router(feed.router, prefix="/api/feed", tags=["Feed"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["Leaderboard"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
