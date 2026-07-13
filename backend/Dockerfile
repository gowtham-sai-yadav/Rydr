# Rydr backend — Phase 4 W8.
#
# Two stages. The builder compiles wheels (psycopg2-binary and bcrypt both
# pull in C extensions); the runtime image installs those wheels and carries
# no compiler, which keeps it smaller and removes build tooling from the
# attack surface of a deployed container.

# ---------------------------------------------------------------------------
FROM python:3.12-slim AS builder

# build-essential and libpq-dev are needed to build the wheels, and are
# deliberately absent from the runtime stage below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY requirements.txt .
RUN pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.txt

# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

# libpq5 is the runtime half of libpq-dev — psycopg2 links against it.
# curl is here for the healthcheck; without it HEALTHCHECK has nothing to run.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl \
    && rm -rf /var/lib/apt/lists/*

# Unbuffered stdout so container logs appear immediately rather than when the
# buffer fills — the difference between watching a deploy and guessing at it.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Run as a non-root user. Nothing in this image needs to write outside its
# own tree, and a container process running as root is a privilege escalation
# waiting for a container-escape bug.
RUN useradd --create-home --uid 10001 rydr

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt .
RUN pip install --no-cache-dir --no-index --find-links=/wheels -r requirements.txt \
    && rm -rf /wheels

COPY --chown=rydr:rydr alembic.ini ./
COPY --chown=rydr:rydr alembic ./alembic
COPY --chown=rydr:rydr app ./app
COPY --chown=rydr:rydr scripts ./scripts
COPY --chown=rydr:rydr docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER rydr

EXPOSE 8000

# The healthcheck hits /api/health/ready, which verifies the database is
# reachable — not /api/health, which only proves the process is up. An
# orchestrator needs to know whether this container can actually serve.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health/ready || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]

# Single worker, deliberately. The chat WebSocket registry lives in process
# memory, so a second worker would silently drop messages between riders
# connected to different workers. Documented in services/ws_manager.py;
# raising this requires a Redis pub-sub layer first.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
