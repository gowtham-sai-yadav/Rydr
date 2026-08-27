from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
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
    return {"status": "ok"}
