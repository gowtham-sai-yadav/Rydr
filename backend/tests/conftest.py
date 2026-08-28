"""Shared pytest fixtures.

Tests run against a real Postgres database — this repo's models use
Postgres-specific types (UUID, enums) that don't work against SQLite —
but a *dedicated* one (``rydr_test``, derived from DATABASE_URL by
swapping the db name), never the dev database from DATABASE_URL itself.

This used to point straight at DATABASE_URL, so every test run's
autouse TRUNCATE fixture wiped the actual dev/demo dataset — anyone
seeded data, ran `pytest`, and found an empty database with no
explanation. `app.dependencies.get_db` is overridden on the shared
`app` so requests through `TestClient` hit the test engine too, not
just direct `db_session` usage.
"""
from __future__ import annotations

import os
import sys

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.dependencies import get_db
from app.main import app

# No separate "import app.models" here — `app.main` already imports every
# router, which imports every model, which registers it with
# Base.metadata as a side effect. Adding it would also shadow the `app`
# name above with the `app` package (import app.models rebinds `app`
# to the package, not the FastAPI instance) - a real footgun.


_CACHE_ATTR = "_rydr_test_database_url"


def _test_database_url() -> str:
    # This module gets imported twice in one pytest run (once as
    # `conftest` via pytest's auto-discovery, once as `tests.conftest` via
    # test files' explicit `from tests.conftest import ...`), so its
    # top-level code runs twice with two distinct module objects - neither
    # os.environ nor settings.DATABASE_URL is a safe place to detect
    # "already computed" (settings gets mutated below; DATABASE_URL may
    # only live in .env, never os.environ). `sys` is the one module
    # Python guarantees is the same object across both imports, so cache
    # the derived URL there instead of re-deriving (and compounding) it.
    cached = getattr(sys, _CACHE_ATTR, None)
    if cached:
        return cached
    base = settings.DATABASE_URL
    # postgresql://user:pass@host:port/rydr -> .../rydr_test
    root, _, db_name = base.rpartition("/")
    url = f"{root}/{db_name}_test" if db_name else base
    setattr(sys, _CACHE_ATTR, url)
    return url


_TEST_DB_URL = _test_database_url()
test_engine = create_engine(_TEST_DB_URL)
TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Bring the test DB's schema to head via the real Alembic chain rather
# than Base.metadata.create_all(): some tables have a genuine 3-way FK
# cycle (ride_plans -> routes -> ride_logs -> ride_plans, from route
# matching + "captured from a ride" provenance), which create_all/drop_all
# can't topologically sort. Alembic doesn't have this problem since each
# migration ALTERs tables into existence incrementally - the same chain
# already runs cleanly against the dev database.
#
# alembic/env.py unconditionally does
# `config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)` to stop
# alembic.ini's checked-in URL from silently pointing prod migrations at
# someone's laptop - so passing sqlalchemy.url on the Config object here
# gets overwritten right back to the dev URL. Point the shared `settings`
# singleton at the test DB first so env.py's override lands on the right
# value instead.
settings.DATABASE_URL = _TEST_DB_URL
_alembic_cfg = Config(os.path.join(os.path.dirname(os.path.dirname(__file__)), "alembic.ini"))
command.upgrade(_alembic_cfg, "head")


def _override_get_db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


app.dependency_overrides[get_db] = _override_get_db

# The chat WebSocket route can't use Depends(get_db) (no per-request
# lifecycle to hang it off for a long-lived connection) so it opens its
# own `SessionLocal()` directly - dependency_overrides above doesn't
# reach that. Patch the name in that module instead so WS tests hit the
# test database too, not the real one.
import app.routers.chat as _chat_router  # noqa: E402

_chat_router.SessionLocal = TestSessionLocal

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
    "direct_messages",
    "dm_threads",
    "user_badges",
    "discussion_comments",
    "discussions",
    "ride_log_comments",
    "ride_media",
    "trip_ride_logs",
    "trips",
    "hazard_reports",
    "event_rsvps",
    "events",
    "user_club_badges",
    "club_challenges",
    "club_badges",
    "club_memberships",
    "clubs",
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
    with test_engine.begin() as conn:
        conn.execute(text(f"TRUNCATE TABLE {', '.join(_TABLES)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def db_session():
    session = TestSessionLocal()
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
