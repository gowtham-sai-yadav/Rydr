#!/usr/bin/env bash
# Rydr dev bootstrap + runner.
# Usage: ./run.sh [--dev|setup|db|backend|frontend|stop|reset|help]

set -euo pipefail

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$ROOT_DIR/venv"
LOG_DIR="$ROOT_DIR/.logs"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_RED=; C_GRN=; C_YLW=; C_BLU=; C_DIM=; C_RST=
fi

log_info()  { echo "${C_BLU}[INFO]${C_RST}  $*"; }
log_ok()    { echo "${C_GRN}[OK]${C_RST}    $*"; }
log_warn()  { echo "${C_YLW}[WARN]${C_RST}  $*"; }
log_error() { echo "${C_RED}[ERROR]${C_RST} $*" >&2; }

die() { log_error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check_prereqs() {
  log_info "checking prerequisites..."
  local missing=()
  command -v docker   >/dev/null 2>&1 || missing+=("docker (install Docker Desktop: https://docs.docker.com/desktop/)")
  if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
    missing+=("docker compose (bundled with Docker Desktop)")
  fi
  command -v python3  >/dev/null 2>&1 || missing+=("python3 (brew install python@3.11)")
  command -v node     >/dev/null 2>&1 || missing+=("node (brew install node, or use nvm)")
  command -v npm      >/dev/null 2>&1 || missing+=("npm (ships with node)")

  if [ ${#missing[@]} -gt 0 ]; then
    log_error "missing prerequisites:"
    for m in "${missing[@]}"; do echo "  - $m"; done
    exit 1
  fi
  log_ok "all prerequisites present"
}

# ---------------------------------------------------------------------------
# docker compose wrapper (v2 plugin vs legacy v1)
# ---------------------------------------------------------------------------
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

# ---------------------------------------------------------------------------
# .env bootstrapping
# ---------------------------------------------------------------------------
ensure_env_files() {
  if [ ! -f "$BACKEND_DIR/.env" ]; then
    [ -f "$BACKEND_DIR/.env.example" ] || die "backend/.env.example missing — cannot bootstrap backend/.env"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    log_ok "created backend/.env from .env.example"
  fi
  if [ ! -f "$FRONTEND_DIR/.env.local" ]; then
    [ -f "$FRONTEND_DIR/.env.example" ] || die "frontend/.env.example missing — cannot bootstrap frontend/.env.local"
    cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env.local"
    log_ok "created frontend/.env.local from .env.example"
  fi
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
start_db() {
  log_info "starting Postgres (docker compose up -d db)..."
  (cd "$ROOT_DIR" && compose up -d db) >/dev/null \
    || die "failed to start Postgres container — run './run.sh logs-db' or 'docker compose logs db' for details"

  log_info "waiting for Postgres to accept connections..."
  local tries=0
  until (cd "$ROOT_DIR" && compose exec -T db pg_isready -U rydr -d rydr) >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then
      die "Postgres did not become ready within 30s — check: docker compose logs db"
    fi
    sleep 1
  done
  log_ok "Postgres ready on localhost:5432"
}

stop_db() {
  log_info "stopping Postgres..."
  (cd "$ROOT_DIR" && compose stop db) >/dev/null || die "failed to stop Postgres"
  log_ok "Postgres stopped"
}

# ---------------------------------------------------------------------------
# Setup (install deps, migrate, seed)
# ---------------------------------------------------------------------------
setup_backend() {
  log_info "setting up backend..."
  if [ ! -d "$VENV_DIR" ]; then
    log_info "creating venv at $VENV_DIR..."
    python3 -m venv "$VENV_DIR" || die "failed to create venv"
  fi

  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"

  log_info "installing backend deps (pip install -r backend/requirements.txt)..."
  pip install --quiet --upgrade pip || die "pip upgrade failed"
  pip install --quiet -r "$BACKEND_DIR/requirements.txt" || die "pip install failed"
  log_ok "backend deps installed"

  log_info "running Alembic migrations..."
  (cd "$BACKEND_DIR" && alembic upgrade head) || die "alembic upgrade failed"
  log_ok "migrations applied"

  log_info "seeding demo data (idempotent — skips if already seeded)..."
  (cd "$BACKEND_DIR" && python -m app.seed) || die "seed script failed"
  log_ok "seed complete"
}

setup_frontend() {
  log_info "setting up frontend..."
  if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log_info "installing frontend deps (npm install)..."
    (cd "$FRONTEND_DIR" && npm install) || die "npm install failed"
  else
    log_info "frontend deps already present (delete frontend/node_modules to force reinstall)"
  fi
  log_ok "frontend ready"
}

setup_all() {
  check_prereqs
  ensure_env_files
  start_db
  setup_backend
  setup_frontend
  log_ok "setup complete"
}

# ---------------------------------------------------------------------------
# Run servers individually
# ---------------------------------------------------------------------------
run_backend() {
  [ -d "$VENV_DIR" ] || die "venv missing — run: ./run.sh setup"
  # shellcheck disable=SC1091
  source "$VENV_DIR/bin/activate"
  log_info "starting FastAPI on http://localhost:8000 (Ctrl+C to stop)..."
  cd "$BACKEND_DIR"
  exec uvicorn app.main:app --reload
}

run_frontend() {
  [ -d "$FRONTEND_DIR/node_modules" ] || die "node_modules missing — run: ./run.sh setup"
  log_info "starting Next.js on http://localhost:3000 (Ctrl+C to stop)..."
  cd "$FRONTEND_DIR"
  exec npm run dev
}

# ---------------------------------------------------------------------------
# Full dev stack (--dev): DB + backend + frontend with interleaved logs
# ---------------------------------------------------------------------------
run_dev() {
  check_prereqs
  ensure_env_files
  start_db

  # Auto-setup on first run
  if [ ! -d "$VENV_DIR" ] || [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    log_info "first-time dev run — running setup..."
    setup_backend
    setup_frontend
  fi

  mkdir -p "$LOG_DIR"
  local BACK_LOG="$LOG_DIR/backend.log"
  local FRONT_LOG="$LOG_DIR/frontend.log"
  : > "$BACK_LOG"
  : > "$FRONT_LOG"

  local BACK_PID="" FRONT_PID="" TAIL_BACK_PID="" TAIL_FRONT_PID=""

  cleanup() {
    echo
    log_warn "shutting down dev servers..."
    for pid in "$TAIL_BACK_PID" "$TAIL_FRONT_PID" "$BACK_PID" "$FRONT_PID"; do
      [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    log_ok "stopped — backend log: $BACK_LOG, frontend log: $FRONT_LOG"
    trap - INT TERM EXIT
  }
  trap cleanup INT TERM EXIT

  # Backend (exec inside subshell → $! is the real uvicorn PID)
  log_info "starting FastAPI on :8000..."
  (
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
    cd "$BACKEND_DIR"
    exec uvicorn app.main:app --reload
  ) > "$BACK_LOG" 2>&1 &
  BACK_PID=$!

  # Frontend
  log_info "starting Next.js on :3000..."
  (
    cd "$FRONTEND_DIR"
    exec npm run dev
  ) > "$FRONT_LOG" 2>&1 &
  FRONT_PID=$!

  # Give them a moment to spin up before tailing
  sleep 2

  # Tail both logs with colored prefixes
  tail -n 0 -F "$BACK_LOG"  | sed -u "s/^/${C_BLU}[BACK]${C_RST}  /" &
  TAIL_BACK_PID=$!
  tail -n 0 -F "$FRONT_LOG" | sed -u "s/^/${C_GRN}[FRONT]${C_RST} /" &
  TAIL_FRONT_PID=$!

  log_ok "dev stack up — visit http://localhost:3000 (Ctrl+C stops everything)"

  # Wait on the server PIDs (not the tails) so if a server crashes, we exit
  wait "$BACK_PID" "$FRONT_PID"
}

# ---------------------------------------------------------------------------
# Reset (destroy DB volume and re-seed)
# ---------------------------------------------------------------------------
reset_db() {
  log_warn "this will DESTROY the local Postgres volume and all DB data."
  read -r -p "continue? [y/N] " ans
  case "${ans:-N}" in
    y|Y) ;;
    *) log_info "cancelled"; exit 0 ;;
  esac
  log_info "nuking DB volume (docker compose down -v)..."
  (cd "$ROOT_DIR" && compose down -v) || die "compose down -v failed"
  start_db
  setup_backend
  log_ok "DB reset and reseeded"
}

# ---------------------------------------------------------------------------
# Usage
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Rydr dev runner.

Usage:
  ./run.sh [command]

Commands:
  --dev       full stack — start DB + backend + frontend with interleaved logs
  setup       install deps, apply migrations, seed DB (run once or after pulls)
  db          start Postgres (detached)
  backend     start FastAPI dev server (foreground, auto-reload)
  frontend    start Next.js dev server (foreground)
  stop        stop Postgres container
  reset       destroy DB volume and re-seed (prompts first)
  help        this message

Common flows:
  First time / daily:   ./run.sh --dev
  Backend only:         ./run.sh db && ./run.sh backend
  Nuke + restart:       ./run.sh reset && ./run.sh --dev
EOF
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------
case "${1:-}" in
  --dev|dev)       run_dev ;;
  setup)           setup_all ;;
  db)              check_prereqs; ensure_env_files; start_db ;;
  backend)         run_backend ;;
  frontend)        run_frontend ;;
  stop)            stop_db ;;
  reset)           reset_db ;;
  help|-h|--help)  usage ;;
  "")              setup_all; echo; usage ;;
  *)               log_error "unknown command: $1"; echo; usage; exit 1 ;;
esac
