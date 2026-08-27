"""Pytest fixtures — Phase 4 W7.

Test database
-------------
Tests run against a real Postgres database named ``rydr_test``, created and
migrated once per session, not against SQLite. The schema leans on Postgres
throughout — ``ON CONFLICT`` upserts, ``UUID`` columns, partial indexes, GIN
trigram indexes, ``SELECT ... FOR UPDATE`` row locks — so a SQLite test suite
would exercise a different application than the one that gets deployed and
would pass while production broke.

The database URL is set in the environment *before* ``app.config`` is
imported, because ``Settings`` reads it at import time and ``app.database``
builds its engine from it immediately. Anything that imports the app before
this module runs would bind to the development database instead.

Isolation
---------
Each test gets a fresh transaction that is rolled back afterwards, so tests
cannot see each other's writes and the suite can be re-run without cleanup.
The FastAPI ``get_db`` dependency is overridden to hand out that same session,
which is what makes a request made through TestClient participate in the
test's transaction.

Data made by a test is also namespaced with a random suffix, because a few
paths commit on their own (``safe_notify_commit``, the badge engine) and a
unique email or destination name keeps those from colliding across runs.
"""
from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://rydr:rydr_secret@localhost:5432/rydr_test",
)

# Must happen before any `app.*` import. See module docstring.
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ["APP_ENV"] = "test"

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402


def _ensure_database() -> None:
    """Create rydr_test if it does not exist, then migrate it to head."""
    admin_url = TEST_DB_URL.rsplit("/", 1)[0] + "/postgres"
    db_name = TEST_DB_URL.rsplit("/", 1)[1]

    admin = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}
        ).scalar()
        if not exists:
            # Identifier cannot be parameterised; db_name comes from our own
            # constant or an operator-set env var, never from user input.
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    admin.dispose()

    # Invoked as `python -m alembic` rather than the bare `alembic` script:
    # the console script only exists on PATH when the virtualenv is activated,
    # and pytest is commonly run as `path/to/venv/bin/python -m pytest`, which
    # does not activate it. sys.executable is always the right interpreter.
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
        env={**os.environ, "DATABASE_URL": TEST_DB_URL, "PYTHONPATH": str(BACKEND_DIR)},
    )


@pytest.fixture(scope="session", autouse=True)
def _database():
    _ensure_database()
    yield


@pytest.fixture(scope="session")
def engine(_database):
    from app.database import engine as app_engine

    return app_engine


@pytest.fixture
def db(engine):
    """A session wrapped in a transaction that is rolled back after the test.

    ``join_transaction_mode="create_savepoint"`` is what makes this work. The
    older recipe — begin a nested transaction and re-open it from an
    ``after_transaction_end`` listener — breaks against this application,
    because several services legitimately open their own savepoints
    (``notifications.safe_notify_commit`` runs every delivery inside one).
    The listener would then restart the wrong savepoint and the application's
    commit would roll back rows it had just written, producing
    ObjectDeletedError inside code that is correct in production.

    SQLAlchemy 2.0's ``create_savepoint`` mode handles that properly: the
    session opens its own savepoint against the enclosing connection
    transaction, application commits release savepoints rather than writing
    through, and nested savepoints from application code stack as they
    normally would.
    """
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    session = Session()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db):
    """TestClient whose requests run inside the test's transaction."""
    from fastapi.testclient import TestClient

    from app.dependencies import get_db
    from app.main import app

    def _get_db_override():
        yield db

    app.dependency_overrides[get_db] = _get_db_override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def tag() -> str:
    """Short random suffix, so data from concurrent or repeated runs cannot
    collide on a unique constraint."""
    return uuid.uuid4().hex[:8]


@pytest.fixture
def make_user(client, tag):
    """Sign a rider up and return (token, user_id, name)."""

    def _make(label: str = "rider", **extra):
        payload = {
            "name": f"{label}-{tag}",
            "email": f"{label}-{tag}-{uuid.uuid4().hex[:6]}@test.invalid",
            "password": "pw12345678",
            **extra,
        }
        res = client.post("/api/auth/signup", json=payload)
        assert res.status_code in (200, 201), res.text
        token = res.json()["access_token"]
        me = client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {token}"}
        ).json()
        return token, me["id"], me["name"]

    return _make


@pytest.fixture
def auth():
    """Build an Authorization header from a token."""
    return lambda token: {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_destination(db, tag):
    from app.models.destination import Destination

    def _make(name: str = "Dest", lat: float = 13.3702, lng: float = 77.6835, **extra):
        d = Destination(
            name=f"{name}-{tag}-{uuid.uuid4().hex[:4]}",
            latitude=lat,
            longitude=lng,
            **extra,
        )
        db.add(d)
        db.flush()
        return d

    return _make
