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
  if python -c "
import sys
from sqlalchemy import create_engine, text
import os
try:
    e = create_engine(os.environ['DATABASE_URL'], pool_pre_ping=True)
    with e.connect() as c:
        c.execute(text('SELECT 1'))
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    echo "[entrypoint] database is up (attempt ${attempt})"
    break
  fi
  if [ "${attempt}" -eq 30 ]; then
    echo "[entrypoint] database did not become reachable in 60s" >&2
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
fi

echo "[entrypoint] starting: $*"
exec "$@"
