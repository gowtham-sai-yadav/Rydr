# Rydr

> A community-driven scenic routing and social platform for motorcycle riders.

Rydr helps a rider — especially a new or solo one — answer *"where should I ride this weekend?"* with scenic destinations filtered by distance, vibe, cost, and vehicle fit, enriched by the community that's already been there, and captured again when you come back.

---

## Status

**Phase 3 — full-scale implementation, in progress.** A PoC was shipped in `0829bdf` covering auth, ride CRUD, group ride planning, and a mocked chat. Phase 3 rewrites the data model around `Destination` as the primary entity and fills out the community + discovery feature set.

For the full Phase 3 scope, milestones, and architecture, see [`PHASE3_PLAN.md`](./PHASE3_PLAN.md).

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 |
| Backend | FastAPI · SQLAlchemy 2.0 · Alembic · Pydantic v2 |
| Database | PostgreSQL 15 (via Docker for dev) |
| Auth | JWT (python-jose) · bcrypt (passlib) |
| Media (planned, M4) | Cloudinary · ImageKit |
| Maps (planned, M2) | Mapbox |

---

## Repo layout

```
P3G4SUS/
├── backend/                    FastAPI application
│   ├── alembic/                Schema migrations
│   ├── app/
│   │   ├── config.py           Settings (reads .env)
│   │   ├── database.py         SQLAlchemy engine + session
│   │   ├── dependencies.py     FastAPI deps (get_db, get_current_user)
│   │   ├── main.py             App entrypoint + router registration
│   │   ├── seed.py             Demo data seed (idempotent)
│   │   ├── models/             SQLAlchemy ORM models
│   │   ├── routers/            API endpoints (auth, users, rides, chat)
│   │   ├── schemas/            Pydantic request/response models
│   │   └── services/           Business logic
│   ├── .env                    Local env (gitignored) — see .env.example
│   ├── .env.example            Template for backend/.env
│   └── requirements.txt
├── frontend/                   Next.js application
│   ├── src/
│   │   ├── app/                App Router pages, grouped by (auth)/(main)
│   │   ├── components/         Shared components
│   │   ├── context/            AuthContext
│   │   └── lib/                API client, types, constants
│   ├── .env.local              Local env (gitignored) — see .env.example
│   ├── .env.example            Template for frontend/.env.local
│   └── package.json
├── docker-compose.yml          Postgres (dev) container definition
├── run.sh                      Dev bootstrap + runner (see below)
├── PHASE3_PLAN.md              Authoritative Phase 3 scope + milestones
├── phase2.pdf                  Phase 2 design document (historical)
├── file final.pdf              Phase 1 PRD (historical)
└── README.md                   You are here
```

---

## Quick start

### Prerequisites

- **Docker Desktop** — for running Postgres locally ([install](https://docs.docker.com/desktop/))
- **Python 3.10+** — for the backend
- **Node.js 20+** and **npm** — for the frontend

`./run.sh` will check for these and tell you what's missing with install hints if any are absent.

### One-command setup

```bash
cd P3G4SUS
./run.sh --dev
```

That's it. On first run the script will:

1. Check all prerequisites
2. Create `.env` files from the `.env.example` templates if missing
3. Start Postgres via Docker and wait for it to be ready
4. Create a Python venv, install backend deps, run migrations, seed demo data
5. Install frontend deps
6. Start the FastAPI backend (`:8000`) and Next.js frontend (`:3000`) with interleaved logs
7. `Ctrl+C` cleanly stops both servers

Then open **http://localhost:3000**.

### Sign in with seeded demo users

Six demo users ship with the seed. Use any of them — password is `password123`:

| Name | Email |
|---|---|
| Alex Rider | `alex@ryder.com` |
| Sam Cruz | `sam@ryder.com` |
| Jordan Miles | `jordan@ryder.com` |
| Casey Storm | `casey@ryder.com` |
| Riley Vance | `riley@ryder.com` |
| Morgan Blake | `morgan@ryder.com` |

---

## Environment variables

### Backend (`backend/.env`)

Copied from `backend/.env.example` on first run. Edit locally if you need to point at a different DB.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://rydr:rydr_secret@localhost:5432/rydr` | Connection string |
| `SECRET_KEY` | `dev-only-...` | JWT signing key. **Replace for production** via `openssl rand -hex 32` |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Access token lifetime |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL (browser-exposed) |

Additional keys will land here as Phase 3 milestones wire up external services (Cloudinary, ImageKit, Mapbox). See `PHASE3_PLAN.md` for details.

---

## `run.sh` command reference

```
./run.sh --dev       full stack — DB + backend + frontend, interleaved logs
./run.sh setup       install deps, apply migrations, seed (idempotent)
./run.sh db          start Postgres, detached
./run.sh backend     start FastAPI in foreground with --reload
./run.sh frontend    start Next.js in foreground
./run.sh stop        stop Postgres container
./run.sh reset       destroy DB volume and re-seed (prompts first)
./run.sh help        usage
```

### Logs

When running `./run.sh --dev`, both server logs are also written to:

- `.logs/backend.log`
- `.logs/frontend.log`

The `.logs/` directory is gitignored.

### Error surfacing

Every step logs `[INFO]`, `[OK]`, `[WARN]`, or `[ERROR]` with a clear reason. Common failure modes:

| Message | Likely cause | Fix |
|---|---|---|
| `[ERROR] missing prerequisites: docker` | Docker Desktop not installed or not in PATH | Install Docker Desktop, restart terminal |
| `[ERROR] Postgres did not become ready within 30s` | Port 5432 in use, or container crashed | `docker compose logs db`, or `lsof -i :5432` to find what's holding the port |
| `[ERROR] alembic upgrade failed` | Schema drift or DB not reachable | `./run.sh reset` wipes and re-migrates |
| `[ERROR] pip install failed` | Network issue or mismatched Python version | Check `python3 --version` ≥ 3.10 |

---

## Development workflow

### Day-to-day

```bash
./run.sh --dev
# code, save, servers auto-reload
# Ctrl+C when done
```

### After pulling main

```bash
./run.sh setup       # reinstalls deps, re-runs migrations, re-seeds if needed
./run.sh --dev
```

### Running only the backend

```bash
./run.sh db          # Postgres in background
./run.sh backend     # FastAPI in foreground
```

### Running only the frontend

In one terminal: `./run.sh db && ./run.sh backend`
In another: `./run.sh frontend`

### Direct DB access

```bash
docker compose exec db psql -U rydr -d rydr
```

### Check current migration

```bash
source venv/bin/activate
cd backend
alembic current
```

### Reset to clean seeded state

```bash
./run.sh reset       # prompts for confirmation — this destroys your local data
./run.sh --dev
```

---

## Documentation

| Document | Purpose |
|---|---|
| [`PHASE3_PLAN.md`](./PHASE3_PLAN.md) | Authoritative Phase 3 scope, milestones, open decisions, code-quality backlog (Appendix B), DB choice rationale (Appendix C) |
| [`phase2.pdf`](./phase2.pdf) | Phase 2 — system design + PoC (historical) |
| [`file final.pdf`](./file%20final.pdf) | Phase 1 — PRD + problem identification (historical) |
| [`CLAUDE.md`](./CLAUDE.md) | Working notes on MCP tools used in this repo |

The PDFs are the original scope documents; `PHASE3_PLAN.md` is the authoritative build plan for Phase 3 and supersedes the PDFs where they differ.

---

## Team

**Project:** Study Project — Rydr
**Advisor:** Swapnil Swarav
**Team:**

- Navneet (2023EBCS685)
- Debashis Maharana (2023EBCS796)
- Gowtham Sai G (2023EBCS761)

---

## License

Academic study project. No license granted for external use at this stage.
