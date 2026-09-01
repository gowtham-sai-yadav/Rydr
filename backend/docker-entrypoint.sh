#!/usr/bin/env bash
# Container entrypoint — Phase 4 W8.
#
# Waits for Postgres, runs migrations, then execs the server.
#
# Migrations run here rather than in a separate deploy step because this
# project has one backend container and no orchestration layer to sequence a
# migration job before it. The tradeoff is recorded rather than hidden: with
# more than one replica, two containers would race to migrate, and the right
# answer then is a one-shot migration job with the replicas waiting on it.
# Alembic takes a lock on alembic_version, so the race is safe rather than
# corrupting — the loser waits and finds nothing to do — but it is not a
# pattern to scale.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"

echo "[entrypoint] waiting for the database..."
for attempt in $(seq 1 30); do
  if python - <<'PY' 2>/tmp/db_probe_err; then
import os
import sys

from sqlalchemy import create_engine, text

# connect_timeout bounds each attempt. Without it an unroutable address
# hangs on the OS connect timeout, so a loop advertising a 60s budget can
# take minutes -- which is how a database misconfiguration first presented
# as the entrypoint simply going silent.
engine = create_engine(
    os.environ["DATABASE_URL"],
    pool_pre_ping=True,
    connect_args={"connect_timeout": 5},
)
with engine.connect() as conn:
    conn.execute(text("SELECT 1"))
PY
    echo "[entrypoint] database is up (attempt ${attempt})"
    break
  fi
  if [ "${attempt}" -eq 30 ]; then
    # Report why, not just that. The reason was previously discarded, which
    # left "did not become reachable" as the only evidence -- true, and
    # useless: unreachable host, refused port, bad password and wrong
    # database name all look identical from here.
    #
    # Sanitised: SQLAlchemy puts the connection URL in some messages, and
    # this goes to a log aggregator.
    echo "[entrypoint] database did not become reachable in 60s" >&2
    echo "[entrypoint] last error was:" >&2
    sed -E 's#(://[^:]+:)[^@]*@#\1****@#g' /tmp/db_probe_err | tail -n 15 >&2
    exit 1
  fi
  sleep 2
done

echo "[entrypoint] running migrations..."
python -m alembic upgrade head

if [ "${SEED_ON_START:-false}" = "true" ]; then
  # Off by default. Seeding is idempotent, but running it automatically in an
  # environment that already has real data is not something to do implicitly.
  echo "[entrypoint] seeding demo data..."
  python -m app.seed || echo "[entrypoint] seed failed (non-fatal)"
  python scripts/seed_badges.py || echo "[entrypoint] badge seed failed (non-fatal)"
  # Activity data: rides, logs, feed posts, ratings, chat, clubs and events.
  # Without this the feed, leaderboards, clubs and stats render as empty
  # states on a fresh deploy.
  #
  # SEED_FRESH regenerates instead of topping up. The plain run is additive:
  # it skips anything already present but still generates a new batch of
  # rides, so repeated deploys pile activity up. --fresh clears what a
  # previous run of this script made -- and only that; rides and posts
  # created through the app are matched by neither purge -- then rebuilds.
  # Off by default because it deletes, which is not something to do
  # implicitly on a service that might hold data someone cares about.
  if [ "${SEED_FRESH:-false}" = "true" ]; then
    python scripts/seed_demo.py --fresh || echo "[entrypoint] demo seed failed (non-fatal)"
  else
    python scripts/seed_demo.py || echo "[entrypoint] demo seed failed (non-fatal)"
  fi
fi

echo "[entrypoint] starting: $*"
exec "$@"
