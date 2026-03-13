# M9 — Code quality + frontend connect pass

**Status:** Finalized 2026-05-28. Backend hardening narrow (3 items) + frontend connect wide (every broken page fixed, every missing page built, minimum styling matching existing dark/orange theme). Polish + design pass is **post-M9**, separate effort.
**Class:** Core.
**Effort estimate:** ~1.5 weeks (this milestone reasonably runs longer than M2–M6 because of the accumulated frontend debt across 5 prior milestones).
**Task ID:** #17.

---

## Goal

Make the application work end-to-end. After M2–M6 shipped backend-only, the
frontend is in three states:

1. **Three pages crash at runtime** (`/rides/create`, `/rides/[id]`, `/chat/[groupId]`)
2. **Five backends have no UI at all** (destinations list/detail/submit, post-ride
   capture, user profile + follow)
3. **One page has functional gaps** (`/profile` doesn't expose `home_*` or
   `bike.mileage_kmpl` which feed the M2 cost-estimate)

M9 closes every gap with **functional, not polished** UI. The design pass
(animations, empty states, real spacing, real loading skeletons, real error
toasts) is a **separate post-M9 effort**.

In parallel, M9 lands the three audit deferrals that have appeared in every
post-M2 audit response as "land in M9":

- JWT hardening (`require=[exp,sub]`, `iss` claim, fail-on-default-secret in non-dev)
- CORS env config (`ALLOWED_ORIGINS` from settings)
- `pydantic-settings 2.x` migration (silences a deprecation warning on every startup)

Exit criterion: `./run.sh --dev` boots cleanly, the user can do the full
flywheel through the UI — signup → set home location → browse destinations →
plan a ride → another user joins → chat → start → complete → log ride → upload
media via Cloudinary → rate destination → follow another rider → "following"
feed filter shows their rides.

## Depends on

- **M1–M6 ✅**: every backend surface this milestone wires up.
- **No new tables**: zero migrations.

## External dependencies — surfaced for approval (approved → zero new)

Per `feedback_ask_before_dependencies`, the audit deferrals could justify
several new deps; we explicitly skip them:

| Dep considered | Verdict | Reason |
|---|---|---|
| `pytest` + `pytest-asyncio` + `httpx` | **Skip** | Test pass is its own milestone. Each prior milestone has a documented curl smoke matrix that still works. |
| `slowapi` (rate limiting) | **Skip** | Academic project; no abuse signal. Production-deploy concern. |
| `react-query` / `@tanstack/react-query` / `swr` | **Skip** | Vanilla `fetch + useEffect` is enough for a prototype. The polish pass can adopt a data layer with a UX rationale. |
| `react-hook-form` | **Skip** | Vanilla `useState` form patterns work at Phase 3 form complexity. |
| `next-cloudinary` | **Skip** | Raw `fetch` upload to the signed URL is ~30 lines; saves a dep. |
| `mapbox-gl` | **Skip for M9** | Belongs in the design pass with a Mapbox token + map UX. |

**Net new deps in M9: zero pip, zero npm.** All work is within the existing
dep tree. M9 becomes much easier to ship and review.

## Decisions resolved (each row is a decision + the reason for it)

| Decision | Outcome | Reason |
|---|---|---|
| Scope split | **Category 1 (must-haves) only.** Category 2/3 deferred. | "Working prototype" goal — get end-to-end functional, polish separately. |
| Design system | **Match existing dark/orange Tailwind theme 1:1.** | `feedback_ui_ux_separate_track` — no UX changes without a design plan; M9 is mechanical wiring, not redesign. |
| Map on destination detail | **Skip.** Show lat/lng + a "Open in Google Maps" deep link instead. | New dep + design call; both belong in the design pass. |
| AbortController plumbing | **Skip.** Vanilla fetch + useEffect cleanup function. | Prototype scope; consumers don't rapid-cycle today. |
| Cloudinary upload | **Raw fetch + FormData.** No `next-cloudinary`. | One file, ~50 lines; avoids the dep. |
| JWT hardening posture | **Fail at startup if `SECRET_KEY` is the placeholder AND `APP_ENV != dev/test`.** `.env.example` keeps a placeholder so dev still works out-of-the-box. | Safe default; explicit opt-in needed for prod. |
| Form library | **Vanilla `useState`.** | Form complexity is low across all Phase 3 surfaces. |
| Implementation order | **Track 1 (backend hardening) first, then frontend tracks 2–7 in sequence.** | Backend is ~1 day; finishing it first means the frontend builds against a stable contract. |
| Frontend `types.ts` rewrite | **Full replace.** Existing file declares stale PoC shapes (`Ride.ride_date`, `ChatMessage.sender_name`, etc.) — these don't exist on any current backend. | Patching is more work than replacing; replace cleanly. |
| New `frontend/src/lib/api.types.ts` | **Yes** — mirrors every backend Pydantic response shape. | M9 plus future work both benefit; types.ts becomes the canonical contract document. |
| `getMe()`-returns-User cast pattern | **Tighten** to `Promise<UserOut>`; AuthContext casts disappear. | M9 fixed the auth flow to return real follow counts; the type should reflect. |

## Out of scope (deferred — explicit, with reasons)

| Item | Where it goes |
|---|---|
| pytest test suite | Separate "test pass" effort, post-Phase-3 |
| Rate limit / slowapi | Production-deploy hardening track |
| `pg_trgm` index on destinations | Post-Phase-3 if dataset grows |
| Trending sort on destinations | Post-Phase-3 product decision |
| Soft-delete chat messages | Post-Phase-3 (M5 hard-delete is documented trade-off) |
| Idempotency keys on chat send | Lands when frontend retry logic does |
| ETag / 304 for chat polling | Post-Phase-3 perf |
| Drop vestigial `chat_groups.name` column | Production hardening |
| `DestinationMedia` Cloudinary cleanup on DELETE | Production hardening |
| `/me/follow` route aliases | UX polish |
| 200 vs 201 status-code sweep | Production hardening |
| Drop `_target_user_exists` (catch IntegrityError) | M6 audit said correctness-protective; keep |
| `is_following_me` reciprocal flag | UX-track feature request |
| `react-query` / abort / dedupe | Frontend polish pass |
| Mapbox map on destination detail | Frontend design pass |
| Real seed data (15+ destinations) | M12 close-out |
| Demo script + Phase 3 report | M12 close-out |
| Frontend design polish (animations, empty/loading/error states, real spacing) | Frontend design pass (post-M9, your call when to start) |

## Scope — Track 1 (backend hardening)

### `backend/app/config.py`

```python
APP_ENV: Literal["dev", "test", "staging", "prod"] = "dev"
ALLOWED_ORIGINS: str = "http://localhost:3000"  # comma-separated

@field_validator("SECRET_KEY")
def _no_default_in_prod(cls, v: str, info) -> str:
    if v == "replace-in-production-..." and info.data.get("APP_ENV") in {"prod", "staging"}:
        raise ValueError("SECRET_KEY must not be the placeholder in non-dev environments")
    return v

# Migration from inner Config class to model_config (pydantic-settings 2.x):
model_config = SettingsConfigDict(env_file=".env")
```

### `backend/app/main.py`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### `backend/app/dependencies.py` + `backend/app/services/auth_service.py`

```python
JWT_ISSUER = "rydr"

def create_access_token(sub: str) -> str:
    return jwt.encode(
        {
            "sub": sub,
            "iss": JWT_ISSUER,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        },
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )

# Both get_current_user and get_optional_user:
payload = jwt.decode(
    token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM],
    issuer=JWT_ISSUER,
    options={"require": ["exp", "sub", "iss"]},
)
```

### `backend/.env.example` and `backend/.env` (if absent)

Document the new `APP_ENV` and `ALLOWED_ORIGINS` variables.

## Scope — Tracks 2–7 (frontend connect)

### Track 2 — Type system foundation

- **New** `frontend/src/lib/api.types.ts`: TypeScript interfaces for every Pydantic response (`UserOut`, `BikeOut`, `RidePlanOut`, `RidePlanSummary`, `ChatMessageOut`, `ChatGroupOut`, `DestinationOut`, `DestinationSummary`, `CostEstimate`, `RideLogOut`, `FollowOut`, `FollowEdgeOut`, `FollowListResponse`, listing responses, etc.). Mirrors the backend exactly.
- **Replace** `frontend/src/lib/types.ts`: drop the stale PoC shapes; re-export the canonical types from `api.types.ts` for back-compat with anything importing `User`, `Bike`, `ChatGroup`, `ChatMessage`, `Ride`.
- **Tighten** `frontend/src/lib/api.ts`: every method returns the typed promise. `getMe(): Promise<UserOut>`, `listDestinations(...): Promise<DestinationListResponse>`, etc.

### Track 3 — Fix the three broken pages

- `/rides/create`: drop the `stops`/`ride_date`/`start_time` PoC payload; rebuild as destination-picker form. Calls `listDestinations({ limit: 100 })` to fill a dropdown, posts `{destination_id, title, planned_date, planned_start_time, visibility, difficulty_level, max_riders}`.
- `/rides/[id]`: rename field reads (`planned_date`, `planned_start_time`, `participant_count`, `destination.name`); show captain badge, participant approval UI when caller is captain, Join button when caller isn't, status badge (planned/in_progress/completed/cancelled), Start + Complete buttons for captain in the right states, chat-room link if `chat_group_id`, "Log this ride" link when status is in_progress or completed and caller is approved.
- `/chat/[groupId]`: rewrite the page to (a) call `getChatGroup(id)` for the header, (b) call `getChatMessages(id)` then poll with `after_id` every 5s, (c) `sendChatMessage(id, body)` on submit and append optimistically.

### Track 4 — Destinations pages

- `/destinations` list: filter chips driven by `getTags()` (already wired). Search input (debounced 300ms). Sort dropdown (rating / distance / popularity). Calls `listDestinations(params)`. Cards link to `/destinations/[id]`.
- `/destinations/[id]` detail: hero image, tags, cost estimate card (calls `getCostEstimate` if user has home location), ratings list, recent riders strip, media gallery, "Plan a ride here" button → `/rides/create?destination={id}`. "Open in Google Maps" deep link (no Mapbox).
- `/destinations/new`: gated by auth. Form with name/description/region/lat/lng/tags/gallery_urls. Vanilla useState. Posts via `submitDestination`.

### Track 5 — Post-ride capture

- `/rides/[id]/log`: owner-only. On mount, call `createRideLog({ride_plan_id})` to ensure a log exists for this rider. Then a form for `actual_cost`, `road_condition`, `recommended`, `notes`, `actual_end_ts`. PATCHes via `updateRideLog`. Photo upload section that calls `signRideMedia` → POSTs to Cloudinary directly → calls `confirmRideMedia` on success. Star rating widget at the bottom calls the M2 `submitRating` with `ride_log_id`.

### Track 6 — User profile + follow UI

- `/users/[id]`: public profile. Shows `UserOut` fields including bike + recent captained rides + follower/following counts. Big Follow / Unfollow button when caller is signed in and viewing someone else (optimistic state).
- `/users/[id]/followers` and `/users/[id]/following`: paginated lists of UserBrief cards.
- `/profile` (existing) gets `home_city`, `home_latitude`, `home_longitude`, `bike.mileage_kmpl`, `bike.engine_cc` inputs added.

### Track 7 — Nav + integration

- `BottomNav.tsx`: add Destinations tab (between Rides and Chat). Keeps 4 items: Destinations / Rides / Chat / Profile.
- Run `./run.sh --dev` and click-through the full flywheel.

## Verification plan

### Backend hardening

1. Start with `APP_ENV=dev` + placeholder `SECRET_KEY` → boots fine.
2. Set `APP_ENV=prod` + placeholder `SECRET_KEY` → server **refuses to start** with clear error.
3. Tokens minted now contain `iss="rydr"`; `jwt.decode` rejects tokens lacking it.
4. Unset `ALLOWED_ORIGINS`, set to `https://foo.example.com`, hit from `localhost:3000` → CORS preflight fails. Add `localhost:3000` back → passes.
5. No `DeprecationWarning` on uvicorn start (pydantic-settings 2.x migration).

### Frontend connect

The matrix matches the "exit criterion" flywheel:

1. `./run.sh --dev` boots, both servers respond.
2. New user signs up via form → home_lat/lng prompt fills → land on profile.
3. Bottom-nav → Destinations → see seeded list → filter by tag "mountain" → 4 results.
4. Click Nandi Hills → detail page renders hero + tags + cost estimate (₹X based on bike).
5. "Plan a ride here" → `/rides/create?destination=...` → form pre-filled with destination → submit → land on `/rides/[id]` showing the new ride.
6. Log out, sign up as second user → request to join the ride → captain (first user) approves from `/rides/[id]`.
7. Open chat from `/rides/[id]` link → both users see messages in real time (within poll cadence).
8. Captain hits Start → status badge changes. Hits Complete.
9. Approved participant lands on `/rides/[id]/log` → fills cost/notes → uploads a photo via Cloudinary widget (URL flows back, gallery shows it) → submits 5-star rating.
10. Back on `/destinations/[id]` → recent riders strip shows participant, `avg_rating` reflects the new rating, gallery includes the uploaded photo (via `link_to_destination=true` flywheel).
11. Captain views participant's `/users/[id]` profile → Follow button → click → `is_followed_by_me=true`, follower count increments.
12. Captain back on `/rides` feed → Following toggle → only sees rides captained by people they follow.

## Files touched

**New (frontend):**
- `frontend/src/lib/api.types.ts`
- `frontend/src/app/(main)/destinations/page.tsx`
- `frontend/src/app/(main)/destinations/[id]/page.tsx`
- `frontend/src/app/(main)/destinations/new/page.tsx`
- `frontend/src/app/(main)/rides/[id]/log/page.tsx`
- `frontend/src/app/(main)/users/[id]/page.tsx`
- `frontend/src/app/(main)/users/[id]/followers/page.tsx`
- `frontend/src/app/(main)/users/[id]/following/page.tsx`
- `frontend/src/components/destinations/*` (DestinationCard, FilterBar, RatingStars — minimum set)
- `frontend/src/components/cloudinary/CloudinaryUpload.tsx`
- `frontend/src/components/users/FollowButton.tsx`

**Modified (frontend):**
- `frontend/src/lib/types.ts` (full replace)
- `frontend/src/lib/api.ts` (typed return values)
- `frontend/src/components/layout/BottomNav.tsx`
- `frontend/src/app/(main)/rides/create/page.tsx` (full rewrite)
- `frontend/src/app/(main)/rides/[id]/page.tsx` (rewrite)
- `frontend/src/app/(main)/chat/[groupId]/page.tsx` (rewrite)
- `frontend/src/app/(main)/profile/page.tsx` (extend with home + bike fields)
- `frontend/src/app/(main)/rides/page.tsx` (use new shapes; add Following toggle)
- `frontend/src/app/(auth)/signup/page.tsx` (capture home location optionally)

**Modified (backend):**
- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/dependencies.py`
- `backend/app/services/auth_service.py`
- `backend/.env.example`

**No new pip packages, no new npm packages, no migrations.**

## Frontend debt CLOSED by M9

- The three broken pages
- Every backend that previously had no UI (M2, M4, M6 surface)
- Profile gaps for M2 cost-estimate inputs
- Bottom nav navigation gap (Destinations primary entity reachable)
- Stale `types.ts` that misleads future contributors

## Frontend debt OPENED by M9 (for the design pass)

- All pages use minimum styling — no animations, no loading skeletons, no empty-state illustrations, no toast component
- Tailwind utility soup — could be extracted into component primitives
- No abort/dedupe on rapid filter changes
- No optimistic UI patterns beyond Follow button (everything else is "submit + wait + show")
- Mobile responsive is best-effort, not designed
- Mapbox map slot on destination detail is just lat/lng text + Google Maps link
- No image lazy-loading, no responsive image variants

These are the design-pass scope.

## What I am explicitly NOT assuming

Verified against actual code before writing this plan:

- ✅ `frontend/src/lib/types.ts` declares **stale PoC shapes** — `Ride.ride_date`, `Ride.start_time`, `Ride.stops`, `ChatMessage.sender_name/content/timestamp/is_mine`, no `User.followers_count`. Confirmed by reading the file.
- ✅ `frontend/src/lib/constants.ts` has `API_BASE_URL` from `NEXT_PUBLIC_API_URL` env, defaulting to `http://localhost:8000`. Confirmed.
- ✅ `frontend/package.json` has `tailwindcss ^4.2.1` + `@tailwindcss/postcss ^4.2.1` in devDependencies. Confirmed. No `react-query`, no `mapbox-gl`, no form library.
- ✅ `frontend/src/context/AuthContext.tsx` uses `api.getMe()` and `as User` cast. The User type doesn't include the M6 follow fields. M9 type tightening fixes this.
- ✅ `backend/.env.example` documents `DATABASE_URL`, `SECRET_KEY`, `ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`. **No `APP_ENV`, no `ALLOWED_ORIGINS`.** M9 adds both.
- ✅ `backend/app/main.py` CORS is hardcoded to `["http://localhost:3000"]` (M2 audit #14 still open).
- ✅ `backend/app/dependencies.py` JWT decode has no `options=` arg (M2 audit #10 still open).
- ✅ `./run.sh --dev` already boots DB + backend + frontend with interleaved logs. No new run-infra needed.
- ✅ `frontend/src/components/` has `layout/` and `rides/`. No `destinations/`, no `cloudinary/`, no `users/`. New directories needed.
- ✅ Backend ride logs (`/api/ride-logs`) and follow (`/api/users/{id}/follow`) endpoints all live and verified in their respective M4/M6 smoke matrices.

Anything outside this list is a documented decision with reasoning.
