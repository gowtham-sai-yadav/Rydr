# Rydr

> A community-driven scenic routing and social platform for motorcycle riders.

Rydr helps a rider, especially a new or solo one, answer "where should I ride this weekend?" with scenic destinations filtered by distance, vibe, cost, and vehicle fit, enriched by the community that has already been there, and captured again when you come back.

---

## Status

**Phase 4 web app: feature-complete.** All planned web features are implemented, migrated, and tested.

Mobile exists in two forms and neither has been compiled on a machine with the Android SDK yet: a Capacitor shell wrapping a static export of this frontend (`frontend/android`, see `docs/plan/phase4-android-release.md`), and an Expo/React Native app in `mobile/`. Signing and the Play Store release are still outstanding for both.

---

## Implemented features

### Destination discovery
- Searchable, filterable destination catalogue (distance, vibe, cost, vehicle fit)
- Destination detail pages with tags, aggregate rating, nearby stops, and cost estimate
- Map view with clustered pins on OpenStreetMap tiles via Leaflet, plus route preview and a journey planner

### Community layer
- Ratings and written reviews per destination
- Photo and video uploads on ride logs via signed Cloudinary uploads
- Ride logging linked back to the destination it was ridden to

### Social layer
- Community feed: posts, likes, and comments
- Group rides: creation, public ride feed, ride detail view
- Request-to-join and captain approval workflow, with automatic waitlisting when a ride is full
- Real-time group chat over WebSockets, with HTTP history for initial load

### Gamification
- Badges and achievements, event-triggered on rides, reviews, and follows
- Rider leaderboard and a "most-ridden this month" destination leaderboard
- Shareable PNG cards for a completed ride or an earned badge

### Supporting systems
- In-app notifications for join requests, approvals/rejections, likes, comments, and badges earned
- Content reporting and an admin moderation queue

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4 |
| Backend | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2 |
| Database | PostgreSQL 15 (via Docker for dev) |
| Auth | JWT (python-jose), bcrypt (passlib) |
| Real-time | FastAPI WebSockets (chat) |
| Media | Cloudinary (signed uploads) |
| Maps | Leaflet + OpenStreetMap tiles, OSRM routing, Nominatim geocoding; a Mapbox adapter activates when `MAPBOX_TOKEN` is set |
| Images | Pillow (server-rendered shareable cards) |

---

## Repo layout

```
repo/
├── backend/                        FastAPI application
│   ├── alembic/                    Schema migrations
│   ├── app/
│   │   ├── config.py                Settings (reads .env)
│   │   ├── database.py              SQLAlchemy engine + session
│   │   ├── dependencies.py          FastAPI deps (get_db, get_current_user, get_current_admin_user)
│   │   ├── main.py                  App entrypoint + router registration
│   │   ├── seed.py                  Demo data seed (idempotent)
│   │   ├── models/                  SQLAlchemy ORM models
│   │   ├── routers/                 API endpoints (auth, users, destinations, rides, ride_logs,
│   │   │                            chat, feed, leaderboard, badges, notifications, moderation)
│   │   ├── schemas/                 Pydantic request/response models
│   │   └── services/                Business logic (cost calculator, badge engine, card renderer,
│   │                                notification service, Cloudinary signing)
│   ├── tests/                       pytest suite
│   ├── Dockerfile
│   ├── .env.example                 Template for backend/.env
│   └── requirements.txt
├── frontend/                        Next.js application
│   ├── src/
│   │   ├── app/                     App Router pages, grouped by (auth)/(main)
│   │   ├── components/              Shared components (feed, chat, destinations, badges,
│   │   │                            notifications, moderation, share cards)
│   │   ├── context/                 AuthContext
│   │   └── lib/                     API client, WebSocket client, types
│   ├── Dockerfile
│   ├── .env.example                 Template for frontend/.env.local
│   └── package.json
├── docker-compose.yml               Postgres, backend, and frontend service definitions
├── run.sh                           Dev bootstrap + runner (see below)
└── README.md                        You are here
```

---

## Quick start

### Prerequisites

- Docker Desktop, for running Postgres locally ([install](https://docs.docker.com/desktop/))
- Python 3.10+, for the backend
- Node.js 20+ and npm, for the frontend

`./run.sh` checks for these and reports what is missing.

### One-command setup

```bash
cd repo
./run.sh --dev
```

On first run the script will:

1. Check all prerequisites
2. Create `.env` files from the `.env.example` templates if missing
3. Start Postgres via Docker and wait for it to be ready
4. Create a Python venv, install backend deps, run migrations, seed demo data
5. Install frontend deps
6. Start the FastAPI backend (`:8000`) and Next.js frontend (`:3000`) with interleaved logs
7. `Ctrl+C` stops both servers cleanly

Then open **http://localhost:3000**.

### Docker Compose (all services)

```bash
docker compose up --build
```

Runs Postgres, the FastAPI backend, and the Next.js frontend as containers. Useful for a clean end-to-end check without a local Python/Node setup.

### Sign in with seeded demo users

Six demo users ship with the seed. Use any of them, password is `password123`:

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

Copied from `backend/.env.example` on first run.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://rydr:rydr_secret@localhost:5432/rydr` | Connection string |
| `SECRET_KEY` | `dev-only-...` | JWT signing key. Replace for production via `openssl rand -hex 32` |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `10080` (7 days) | Access token lifetime |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS origins |
| `CLOUDINARY_CLOUD_NAME` | empty | Cloudinary cloud name for signed media uploads. Uploads are disabled until set. |
| `CLOUDINARY_API_KEY` | empty | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | empty | Cloudinary API secret |

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend base URL (browser-exposed) |
| `MAPBOX_TOKEN` | empty | Backend-side. Empty uses OpenStreetMap for tiles, routing and geocoding; setting it switches every map call to Mapbox. |

---

## `run.sh` command reference

```
./run.sh --dev       full stack: DB + backend + frontend, interleaved logs
./run.sh setup       install deps, apply migrations, seed (idempotent)
./run.sh db          start Postgres, detached
./run.sh backend     start FastAPI in foreground with --reload
./run.sh frontend    start Next.js in foreground
./run.sh stop        stop Postgres container
./run.sh reset       destroy DB volume and re-seed (prompts first)
./run.sh help        usage
```

### Logs

When running `./run.sh --dev`, both server logs are also written to `.logs/backend.log` and `.logs/frontend.log` (gitignored).

### Common failure modes

| Message | Likely cause | Fix |
|---|---|---|
| `[ERROR] missing prerequisites: docker` | Docker Desktop not installed or not in PATH | Install Docker Desktop, restart terminal |
| `[ERROR] Postgres did not become ready within 30s` | Port 5432 in use, or container crashed | `docker compose logs db`, or `lsof -i :5432` |
| `[ERROR] alembic upgrade failed` | Schema drift or DB not reachable | `./run.sh reset` wipes and re-migrates |
| `[ERROR] pip install failed` | Network issue or mismatched Python version | Check `python3 --version` is 3.10 or newer |

---

## Testing

### Backend

```bash
cd backend
source ../venv/bin/activate      # or your own venv
PYTHONPATH=. python -m pytest
```

The suite covers destinations, ride planning and capacity, waitlisting, the follow system, chat (including the WebSocket endpoint), the social feed, leaderboards, badges, notifications, moderation, and shareable cards. It runs against the same Postgres instance `run.sh` starts, so bring the DB up first with `./run.sh db`.

### Frontend

```bash
cd frontend
npx tsc --noEmit    # type check
npm run build        # production build
```

There is no frontend test runner configured yet; type checking and the production build are the current correctness gates.

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
./run.sh reset       # prompts for confirmation, this destroys your local data
./run.sh --dev
```

---

## Documentation

| Document | Purpose |
|---|---|
| [`docs/plan/`](./docs/plan) | Per-milestone implementation plans (destination discovery, ride planning, chat, follow system, badges, and more) |
| [`docs/review/`](./docs/review) | Post-implementation audits per milestone |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | System architecture overview |

---

## Team

**Project:** Study Project, Rydr
**Advisor:** Swapnil Saurav
**Team:**

- Navneet (2023EBCS685)
- Debashis Maharana (2023EBCS796)
- Gowtham Sai G (2023EBCS761)

---

## License

Academic study project. No license granted for external use at this stage.
