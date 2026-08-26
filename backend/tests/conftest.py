"""Shared pytest fixtures.

Tests run against a real Postgres database (DATABASE_URL from the
environment) with the schema already applied via ``alembic upgrade
head`` — this repo's models use Postgres-specific types (UUID, enums)
that don't work against SQLite. Every test truncates its data tables on
teardown so tests stay independent without needing a fixture-per-table
factory.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import SessionLocal, engine
from app.main import app

_TABLES = [
    "notifications",
    "reports",
    "badges",
    "tags",
    "post_comments",
    "post_likes",
    "posts",
    "chat_messages",
    "chat_groups",
    "user_badges",
    "discussion_comments",
    "discussions",
    "ride_media",
    "ride_logs",
    "ratings",
    "destination_media",
    "destination_tags",
    "ride_plan_participants",
    "ride_plans",
    "route_points",
    "routes",
    "follows",
    "destinations",
    "bikes",
    "users",
]


@pytest.fixture(autouse=True)
def _clean_db():
    yield
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {', '.join(_TABLES)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db_session():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def signup(client: TestClient, email: str, name: str = "Test Rider") -> dict:
    resp = client.post(
        "/api/auth/signup",
        json={"name": name, "email": email, "password": "password123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def create_destination(client: TestClient, token: str, name: str = "Test Destination") -> dict:
    resp = client.post(
        "/api/destinations",
        headers=auth_headers(token),
        json={
            "name": name,
            "latitude": 31.5,
            "longitude": 77.1,
            "terrain_difficulty": "moderate",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def create_and_complete_ride(
    client: TestClient, token: str, destination_id: str, planned_date: str
) -> str:
    resp = client.post(
        "/api/rides",
        headers=auth_headers(token),
        json={
            "destination_id": destination_id,
            "title": "Test ride",
            "planned_date": planned_date,
            "planned_start_time": "08:00:00",
            "max_riders": 2,
        },
    )
    assert resp.status_code == 201, resp.text
    ride_id = resp.json()["id"]

    resp = client.post(f"/api/rides/{ride_id}/start", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    resp = client.post(f"/api/rides/{ride_id}/complete", headers=auth_headers(token))
    assert resp.status_code == 200, resp.text
    return ride_id
