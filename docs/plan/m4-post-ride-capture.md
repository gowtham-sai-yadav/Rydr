# M4 — Post-ride capture + Cloudinary integration

**Status:** Finalized 2026-05-24. Backend-first; frontend deferred per `feedback_ui_ux_separate_track`.
**Class:** Core. **This is the data flywheel — non-negotiable for Phase 3.**
**Effort estimate:** ~1 week.
**Task ID:** #12.

---

## Goal

Close the flywheel. After a `RidePlan` completes, each rider creates their personal `RideLog` with: photos/videos (via Cloudinary), actual cost, road condition, recommend yes/no, free-text notes, and a destination rating (reusing M2's atomic upsert endpoint with `ride_log_id` linked). Media optionally back-links to the destination (`destination_media`) so future discoverers see real rider photos.

See `PHASE3_PLAN.md §6 M4` for the exit criterion:

> User finishes ride → uploads media + rating + feedback; destination data updates.

## Depends on

- **M1** — `ride_logs`, `ride_media`, `ratings`, `destination_media` tables ✅
- **M3** — `ride_plans` lifecycle + captain ownership ✅
- **Task #8** — Cloudinary account (cloud_name + API key + API secret) — *required for live media uploads; M4 ships behind a feature flag so the data-flywheel half lands without it*

## External dependencies (approved)

- **Cloudinary** account — free tier 25 GB storage / 25 GB bandwidth-mo.
- **`cloudinary` Python package** (PyPI) — official SDK; signing only, ~5 lines.
- **Env vars**: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

**Feature-flag policy:** when the env vars are unset, `POST /api/ride-logs/{id}/media/sign` returns 503 with a clear "Cloudinary not configured" message. Every other endpoint (log CRUD, status transitions, manual URL confirm, rating link-through) works without Cloudinary so the data-flywheel half can be exercised end-to-end before the account exists.

## Decisions resolved (was open in stub)

| Question | Decision | Rationale |
|---|---|---|
| URL path | Plan-level → `/api/rides/{id}/start`, `/complete` (matches M3 convention). Log-level → `/api/ride-logs/{id}/...` (first-class resource). | Mirrors M3's decision to keep `/api/rides`. Logs aren't sub-paths of a ride — riders log independently. |
| Per-rider vs single log | **Per-rider.** Each approved participant + captain creates their own `RideLog`. | M1 schema already keys logs by `(ride_plan_id, rider_id)`. |
| Start semantics | Captain-only `POST /api/rides/{id}/start` (planned → in_progress). No auto-flip on first log — explicit captain action keeps the plan state machine predictable. | Auto-flip would fire on accidental log creation and silently drop the ride from the feed. |
| Complete semantics | Captain-only `POST /api/rides/{id}/complete` (planned or in_progress → completed). | Same ownership model as M3 cancel. |
| Log allowed when? | Anytime ride.status ≠ cancelled. Independent of plan status. | A rider may want to log retroactively even before captain hits /start. |
| One log per rider per ride? | **Yes** — `UniqueConstraint(ride_plan_id, rider_id)` on `ride_logs`. | Prevents accidental dupes; same pattern as M3 participant constraint. |
| Cloudinary integration | **Backend signs, browser uploads direct to Cloudinary.** Backend receives a confirm payload after. | Saves bandwidth; standard pattern. |
| Python SDK | Use official `cloudinary` package | Auditable, ~5 lines vs ~30 for manual HMAC. |
| Image + video | Both — schema's `MediaType` enum already covers it. Cloudinary `resource_type=auto`. | Single upload flow. |
| Size limits | Image ≤ 10 MB, video ≤ 100 MB — enforced in signing params + documented client-side. | Cloudinary free tier ceiling. |
| Link media to destination | **ON by default** (`link_to_destination: bool = True`) — opt-out via the confirm payload. | Flywheel intent per PRD. |
| Auto-complete | **NO** for M4. Manual captain action only. | Phase 3 scope. |
| Rating delete | **NO** for M4. Upsert (M2 endpoint) only. | Rare ask; defer. |
| Rating endpoint | Reuse M2's `POST /api/destinations/{id}/ratings`; client passes `ride_log_id` to link the rating to the executed trip. | DRY; no new endpoint. |
| Tests | Skip pytest for M4. Verify by curl per the smoke matrix below. | M9 is the testing milestone. |

## Schema patch (minor)

`ride_logs` is missing a unique constraint on `(ride_plan_id, rider_id)`. M4 adds it via a small Alembic migration so concurrent "Create my log" double-submits resolve cleanly via ON CONFLICT (same atomic-upsert pattern as M2 ratings + M3 participants). The table is empty in seed data so backfill is a no-op. Only schema delta from M3.

## Scope — backend

### New router: `routers/ride_logs.py` (`/api/ride-logs`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/ride-logs` | **required** | Create the caller's RideLog for a given `ride_plan_id`; atomic via ON CONFLICT |
| GET | `/api/ride-logs/{id}` | optional | Detail with media + linked rating |
| PATCH | `/api/ride-logs/{id}` | **required (owner)** | Update cost / road / recommended / notes / end_ts |
| POST | `/api/ride-logs/{id}/media/sign` | **required (owner)** | Return signed Cloudinary upload params (or 503 if not configured) |
| POST | `/api/ride-logs/{id}/media` | **required (owner)** | Confirm uploaded media; optionally back-link to destination |
| DELETE | `/api/ride-logs/{id}/media/{media_id}` | **required (owner)** | Remove a media row (does not delete from Cloudinary in M4) |
| GET | `/api/rides/{id}/logs` | optional | List all logs for a ride (paginated, owner UserBrief embedded) |

### Updated router: `routers/rides.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/rides/{id}/start` | **required (captain)** | planned → in_progress |
| POST | `/api/rides/{id}/complete` | **required (captain)** | {planned, in_progress} → completed |

### Validation gates (lessons from M2/M3 audits applied)

- Only approved participants or the captain can create a log for a given ride.
- Reject log creation if `ride.status == cancelled`.
- One log per `(ride_plan_id, rider_id)` — atomic ON CONFLICT.
- Cannot start/complete a cancelled or already-completed ride.
- `actual_cost ≥ 0`, `≤ 1_000_000`.
- `notes ≤ 5000 chars`.
- `caption ≤ 500 chars`; `url ≤ 500 chars`.
- Media URL must start with `https://` (M2 audit pattern).
- Captain auto-joined as approved (from M3) — they can log without an explicit participant row check beyond the captain-id match.
- All paginated list queries end in `.id.asc()` tiebreaker.

### Concurrency / eager loading

- Log creation uses `pg_insert(RideLog).on_conflict_do_update(...)` keyed on `uq_ride_log_ride_rider` — repeated create returns existing without 500.
- Detail / list endpoints use `selectinload(RideLog.media, RideLog.rider, RideLog.rating)` to avoid N+1.
- Media confirm with `link_to_destination=true` also inserts into `destination_media` in the **same transaction** — the existing rating recompute pattern already proved this works.

### Cloudinary service (`services/cloudinary_service.py`)

```
def is_configured() -> bool:
    return bool(settings.CLOUDINARY_CLOUD_NAME and settings.CLOUDINARY_API_KEY and settings.CLOUDINARY_API_SECRET)

def sign_upload(folder: str, public_id: str | None = None) -> SignatureResponse:
    # returns timestamp + signature + cloud_name + api_key + upload_url + size limits
    # raises 503 via caller if not is_configured()
```

The service is the only module that imports `cloudinary` so the dep stays isolated and easy to swap.

## Out of scope (deferred)

- Cloudinary media deletion on `DELETE /media` (M4 just unlinks the DB row; orphan cleanup is a Cloudinary admin task) — M9 housekeeping
- Rating delete — M9 if requested
- GPS trace upload (stretch M11)
- Auto-complete past planned end time — never (per decision)
- Frontend UI (capture form, photo picker, rating stars) — UX track
- Auth hardening / CORS / typed frontend — M9
- Notifications to other riders when someone uploads — M6 (`# TODO M6` markers)

## Verification plan (no pytest in M4)

After implementation:

1. `./run.sh` boots DB + applies new migration.
2. Curl spot-checks (sequence — needs an M3 ride to exist first):
   - Captain creates a group ride (M3).
   - Participant joins + captain approves (M3).
   - Captain hits `POST /api/rides/{id}/start` → status=in_progress; non-captain → 403; cancelled ride → 409.
   - Participant `POST /api/ride-logs {ride_plan_id}` → 201; repeat → idempotent same row; non-participant → 403; on cancelled ride → 409.
   - `PATCH /api/ride-logs/{id}` (owner) with cost+notes → 200; not owner → 403.
   - `POST /api/ride-logs/{id}/media/sign` → 503 with clear message (Cloudinary unconfigured) until env vars set; 200 with signature payload after.
   - `POST /api/ride-logs/{id}/media {url, link_to_destination:true}` → 201; verify a `destination_media` row was also created with the same URL.
   - `GET /api/ride-logs/{id}` → includes media list.
   - `POST /api/destinations/{dest_id}/ratings {stars, ride_log_id}` (existing M2 endpoint) → 201; destination `avg_rating`/`rating_count` recomputed (already proven in M2).
   - `GET /api/destinations/{dest_id}` → `recent_rider_count >= 1` now that a log with `actual_end_ts` exists in the 90-day window.
   - Captain `POST /api/rides/{id}/complete` → status=completed; non-captain → 403.

## Files touched

**New:**
- `backend/alembic/versions/f1a2b3c4d5e6_m4_ride_log_unique.py`
- `backend/app/routers/ride_logs.py`
- `backend/app/services/cloudinary_service.py`

**Modified:**
- `backend/requirements.txt` (add `cloudinary`)
- `backend/app/config.py` (`CLOUDINARY_*` empty-default settings)
- `backend/app/models/ride_log.py` (UniqueConstraint declaration)
- `backend/app/schemas/ride_log.py` (response wrappers, `CloudinarySignature`, `RideMediaConfirm`)
- `backend/app/routers/rides.py` (add `/start` + `/complete`)
- `backend/app/main.py` (include ride_logs router)
- `frontend/src/lib/api.ts` (ride-log + start/complete + Cloudinary signing methods)

## Exit criteria (from PHASE3_PLAN.md)

> User finishes ride, uploads photos + feedback + rating, destination page reflects the new data (updated avg_rating, new media in gallery).

Met when the curl matrix above passes — including the `recent_rider_count` going from 0 → 1 on Nandi's detail after a log with `actual_end_ts` is created (which closes the M2 placeholder).

## Frontend debt opened by M4

- Post-ride capture page (photo picker, rating stars, cost input, road condition, recommend toggle, notes) — UX-track work
- Direct Cloudinary upload component on the frontend (using the signing endpoint) — UX-track
- Surfacing the new "ride photos by rider X" gallery on destination detail

## Frontend debt closed by M4

None (backend-only milestone). `recent_rider_count` placeholder on destination detail will now produce real numbers, no FE change needed.
