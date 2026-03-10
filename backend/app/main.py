from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, chat, destinations, ride_logs, rides, tags, users

app = FastAPI(title="Ryder API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


@app.get("/api/health")
def health():
    return {"status": "ok"}
