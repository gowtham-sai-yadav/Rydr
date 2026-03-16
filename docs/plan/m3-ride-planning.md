# M3 — Ride planning against destinations

**Status:** Finalized 2026-05-24. Backend-first; frontend deferred per `feedback_ui_ux_separate_track`.
**Class:** Core.
**Effort estimate:** ~1 week.
**Task ID:** #11.

---

## Goal

Replace the M1 stub `routers/rides.py` with a real ride-planning surface anchored to a `destination_id`. A user picks a destination from M2 discovery, plans a solo or group ride targeting it, and (for group rides) collects approved riders via captain approval. M3 ships only the **planning** half — execution (start / complete) and post-ride capture are M4 territory.

See `PHASE3_PLAN.md §6 M3` for the exit criterion:

> User can plan solo or group ride targeting a destination; captain approval flow still works.

## Depends on

- **M1** — `ride_plans`, `ride_plan_participants`, `chat_groups`, `routes` tables ✅
- **M2** — destination discovery endpoints ✅ (so users pick a `destination_id` before creating a ride; M2 cost-estimate is also reusable from the create page later)

## External dependencies

**None.** No new pip packages, no new env vars, no third-party services.

## Decisions resolved (was open in stub)

| Question | Decision | Rationale |
|---|---|---|
| URL path: `/api/rides` vs `/api/ride-plans` | **Keep `/api/rides`** | Frontend already mounts here; users say "ride"; renaming churns the API surface without semantic value. Internal class stays `RidePlan`. |
| Multiple rides → same destination, same day? | **Allow** | No PRD constraint; different captains/times are legitimate. |
| `visibility=solo` → still create a ChatGroup? | **Skip** | ChatGroup exists for group coordination. Solo riders don't need it; M5 chat endpoints will return 404 for solo rides. |
| Cancellation rights | **Captain cancels the plan** (status=cancelled); **participants leave** (participant.status=left). Two endpoints. | Clean ownership; matches what users expect. |
| Notify participants on cancel | **Defer to M6** | Notifications are explicitly M6 scope. M3 leaves a `# TODO M6: notify participants` marker; no plumbing. |
| Join model | **Captain approval (PRD-default)** | Open-join can land later as a `RidePlan.open_join: bool` flag if engagement data demands it. |
| Captain auto-joins own ride? | **Yes — same transaction** as ride create, with `participant.status=approved` | Otherwise "is X going on this ride" queries get awkward. |
| Status transitions covered | **Only `planned → cancelled` in M3** | `in_progress` and `completed` are events that fire during/after a ride — they belong with post-ride capture (M4). |
| Past `planned_date` allowed on create? | **No — must be today or future** (`planned_date >= today`) | Historical trips become RideLogs (M4 flow). The plan-vs-log boundary stays clean. |
| Test suite | **Skip pytest for M3; verify by curl** | M9 owns the testing milestone (same pattern as M1/M2). |

## Schema patch (minor)

M1's `ride_plan_participants` is missing two things that block clean M3 implementation:

1. A unique constraint on `(ride_plan_id, user_id)` — without it, two concurrent `POST /join` calls from the same user can write duplicate participant rows (silently wrong rather than the M2-rating IntegrityError 500, but still wrong).
2. `created_at` / `updated_at` columns — needed so the participants list can sort by join order (UUID v4 ids aren't chronological) and so `updated_at` reflects approve/reject moments.

M3 adds both in one Alembic migration. Both columns are `NOT NULL` with `server_default=NOW()`; the participants table is empty in seed data so backfill is trivial. The join endpoint then uses `ON CONFLICT DO UPDATE` keyed on `uq_participant_ride_user` so a re-join (or double-tap) is atomic. These are the only schema deltas from M1.

## Scope — backend

All endpoints under `/api/rides` (replacing the M1 stubs).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/rides` | **required** | Create RidePlan; captain auto-joined; group→creates ChatGroup |
| GET | `/api/rides/feed` | optional | Upcoming **planned group** rides; filterable by `destination_id`, `region`, date window |
| GET | `/api/rides/mine` | **required** | Rides I captain *or* participate in; role discriminator on each row |
| GET | `/api/rides/{id}` | optional | Detail with destination summary, captain, participants, chat_group_id |
| PUT | `/api/rides/{id}` | **required (captain)** | Update mutable fields |
| DELETE | `/api/rides/{id}` | **required (captain)** | Cancel (sets `status=cancelled`; not a hard delete) |
| POST | `/api/rides/{id}/join` | **required** | Request to join → participant.status=pending (atomic; idempotent on re-join) |
| POST | `/api/rides/{id}/leave` | **required** | Self-leave → participant.status=left (captain blocked from leaving — they cancel instead) |
| GET | `/api/rides/{id}/participants` | optional | List with status filter + pagination |
| PUT | `/api/rides/{id}/participants/{user_id}` | **required (captain)** | Approve / reject pending participants |

### Filter / sort rules

- **Feed:** `status=planned`, `visibility=group`, `planned_date >= today`. Filters: `destination_id`, `region` (joined via Destination), `date_from`, `date_to`. Sort: `planned_date asc, planned_start_time asc, id asc` (tiebreaker per M2 audit fix #4).
- **Mine:** captain OR participant (excluding `status=left` by default; `include_left=true` to opt in). Filter by `status`. Sort: `planned_date desc, id asc`.
- **Participants:** filter by `status`. Sort: `created_at asc, id asc`.

### Validation gates (lessons from M2 audit applied)

- `destination_id` must reference an existing Destination → 404 if not.
- `planned_date >= today` (server-side check; client tz allowance: `today` in UTC).
- `max_riders` in [1, 50] via `Field(ge=1, le=50)`.
- `title` ≤ 200 chars; `description` ≤ 5000.
- Captain attempting `POST /join` returns 409 — they're already an approved participant.
- Joining a cancelled or completed ride → 409.
- Captain attempting `POST /leave` → 409 (they must cancel instead).
- `PUT /participants/{user_id}` accepts only `status in {approved, rejected}` — `pending` and `left` aren't captain-driven.
- Captain can't be downgraded via the participants endpoint (404 — they're not a "participant" in that sense even though the row exists).

### Concurrency / eager loading

- Join uses `pg_insert(RidePlanParticipant).on_conflict_do_update(...)` keyed on `uq_participant_ride_user` (same pattern as M2 rating upsert).
- All list endpoints use `selectinload` for `captain`, `destination`, `participants.user` to avoid N+1.
- Every paginated list ends in `.id.asc()` tiebreaker.

### Schemas (additions in `schemas/ride.py`)

- `RidePlanSummary` — leaner shape for feed/mine (no participants array; just destination summary + counts).
- `RidePlanListResponse` — `{ rides: [RidePlanSummary], total, page, limit }`.
- `MineRideOut` — extends `RidePlanSummary` with `role: "captain" | "participant"` + `my_participant_status: ParticipantStatus | null`.
- `MineRidesResponse` — `{ rides: [MineRideOut], total, page, limit }`.
- `ParticipantListResponse` — `{ participants: [RidePlanParticipantOut], total, page, limit }`.
- `RidePlanOut` extended: `chat_group_id: UUID | null`, `participant_count: int` (already there).
- `RidePlanCreate.planned_date` validator: must be `>= date.today()`.

### Frontend api.ts (typed stubs only, no UI)

- Update `createRide` payload shape to take `destination_id`, `planned_date`, `planned_start_time` (drop the `stops`/`ride_date` PoC fields).
- Add `leaveRide(id)`.
- Replace `joinRide`/`getRide`/`getParticipants`/`updateParticipant` to match new response shapes (still typed `unknown` per the M2 pattern; M9 will tighten types repo-wide).
- The existing `create/page.tsx` references a `stops` array that's no longer in scope — UI rewrite is UX-track work; M3 leaves a comment in api.ts pointing at the obsolete client surface.

## Out of scope (deferred)

- `in_progress` and `completed` status transitions — **M4** (post-ride capture starts when "I'm riding now" / "I finished" fires).
- Notifications on cancel / approve — **M6** (follow system + notification stub).
- ChatGroup messages — **M5** (the table is live but endpoints stay stubbed).
- Open-join `RidePlan.open_join` flag — defer until engagement signal demands it.
- Frontend UI (list page redesign, create page rewrite around destinations) — UX track.
- Auth hardening, CORS, JWT — M9.

## Verification plan (no pytest in M3)

After implementation:

1. `./run.sh` boots DB; new migration applied via `alembic upgrade head`.
2. Curl spot-checks:
   - `POST /api/rides` (group) → 201, captain auto-listed as approved participant, chat_group_id populated
   - `POST /api/rides` (solo) → 201, no chat group
   - `POST /api/rides` with bad `destination_id` → 404
   - `POST /api/rides` with past `planned_date` → 422
   - `GET /api/rides/feed` → returns only future planned group rides; cancelled / past / solo rides excluded
   - `GET /api/rides/feed?destination_id=<id>` → filters correctly
   - `GET /api/rides/mine` (as captain) → role=captain on captained rides
   - `GET /api/rides/mine` (as other user after join) → role=participant + status surfaced
   - `POST /api/rides/{id}/join` (other user) → 201, status=pending; repeat → 200 idempotent (no duplicate row)
   - `POST /api/rides/{id}/join` (captain) → 409
   - `POST /api/rides/{id}/join` 10× concurrent same user → all 2xx, exactly one participant row
   - `PUT /api/rides/{id}/participants/{other_id}` (captain) status=approved → 200
   - `PUT /api/rides/{id}/participants/{other_id}` (not captain) → 403
   - `POST /api/rides/{id}/leave` (approved participant) → 200, status=left
   - `POST /api/rides/{id}/leave` (captain) → 409
   - `DELETE /api/rides/{id}` (captain) → 200, status=cancelled; subsequent `POST /join` → 409
   - `DELETE /api/rides/{id}` (not captain) → 403

## Files touched

**New:**
- `backend/alembic/versions/e5f7d9a3c6b2_m3_ride_participant_unique.py`

**Modified:**
- `backend/app/models/ride.py` (add UniqueConstraint to RidePlanParticipant)
- `backend/app/schemas/ride.py` (new response wrappers, RidePlanSummary, MineRideOut, validators)
- `backend/app/routers/rides.py` (full implementation replacing the stub)
- `frontend/src/lib/api.ts` (align ride methods to new shape; add `leaveRide`)

**Not modified:** Other models, M2 router, auth, dependencies (all reused as-is).

## Exit criteria (from PHASE3_PLAN.md)

> User can plan solo or group ride targeting a destination; captain approval flow still works.

Met when the curl matrix above passes. The "frontend can render this" half waits for the UX track.

## Frontend debt opened by M3

- `/rides` index, `/rides/[id]`, `/rides/create` all need rewrite around destination-first flow.
- `/rides/create` references a `stops` concept that doesn't exist in the M1 schema (`Route` + `RoutePoint` is optional and not exposed in M3) — that page is currently broken against the new backend.

## Frontend debt closed by M3

None — backend-only milestone.
