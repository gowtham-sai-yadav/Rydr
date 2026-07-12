from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    badges,
    chat,
    clubs,
    destinations,
    direct_messages,
    events,
    feed,
    hazards,
    heatmap,
    leaderboard,
    live,
    moderation,
    notifications,
    ride_logs,
    rides,
    routes,
    tags,
    trips,
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
app.include_router(routes.router, prefix="/api/routes", tags=["Routes"])
app.include_router(ride_logs.router, prefix="/api/ride-logs", tags=["RideLogs"])
app.include_router(trips.router, prefix="/api/trips", tags=["Trips"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(direct_messages.router, prefix="/api/dm", tags=["DirectMessages"])
app.include_router(live.router, prefix="/api", tags=["Live"])
app.include_router(hazards.router, prefix="/api/hazards", tags=["Hazards"])
app.include_router(heatmap.router, prefix="/api/heatmap", tags=["Heatmap"])
app.include_router(clubs.router, prefix="/api/clubs", tags=["Clubs"])
app.include_router(events.router, prefix="/api/events", tags=["Events"])
app.include_router(badges.router, prefix="/api/badges", tags=["Badges"])
app.include_router(feed.router, prefix="/api/feed", tags=["Feed"])
app.include_router(leaderboard.router, prefix="/api/leaderboard", tags=["Leaderboard"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(moderation.router, prefix="/api/moderation", tags=["Moderation"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
