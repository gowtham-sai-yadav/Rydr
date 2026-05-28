# M2 — Destination discovery

**Status:** Finalized 2026-05-23. Backend-first; frontend deferred per `feedback_ui_ux_separate_track`.
**Class:** Core.
**Effort estimate:** ~1.5 weeks.
**Task ID:** #10.

---

## Goal

Deliver the core discovery loop on the backend: a user can filter destinations by vibe tag, vehicle fit, radius from a home/origin point, and budget, see a ranked list, and pull a detail view with tags, media, rating aggregates, recent rider activity, and a per-user cost estimate. Frontend integration ships in a later UX-track increment.

See `PHASE3_PLAN.md §4.1` items 2-3 and `§6 M2` for exit criteria:

> User can filter by tag + radius + vehicle + budget and see a ranked list.

## Depends on

- **M1** — `destinations`, `tags`, `destination_tags`, `destination_media`, `ratings`, `users.home_*`, `bikes.mileage_kmpl` exist. ✅ Shipped (commit `b329170`).
- **Task #6** (real destination research, 10–15 entries) — *not blocking*: M1 seeded 5 demo destinations, which is enough to validate filters/sort/cost. Real research can backfill via the `POST /api/destinations` endpoint shipped in this milestone.

## External dependencies

**None.** Mapbox is a frontend concern and waits for the UX track. Haversine is plain SQL. No new Python packages.

## Decisions resolved (was open in stub)

| Question | Decision | Rationale |
|---|---|---|
| Cost-calc formula | `fuel = (2 × distance_km / mileage_kmpl) × FUEL_PRICE_INR_PER_L`; `total = fuel + food + entry`; range = ±20% | Round-trip default matches PRD discovery intent. ±20% buffer surfaces uncertainty without false precision. |
| Fuel price source | Single env constant `FUEL_PRICE_INR_PER_L`, default ₹105.0 | Avoids a third-party price feed dep. Easy to bump. |
| Sort algorithm | Three modes: `rating` (default), `distance`, `popularity`. No weighted score yet. | Simpler to reason about; weighted score can land in M9 if PMs ask. |
| "Riders who went recently" | `recent_rider_count` (distinct riders w/ RideLog in last 90 days) + up to 3 most recent `UserBrief`. Public — no privacy gate. | Phase 3 has no follow/privacy model yet; everything is public. M6 (follow) can layer scoping later. |
| New-destination submission | Auto-publish; record `submitted_by_user_id`. No moderation flag. | Academic scope, no admin tooling; submitters are trusted authenticated users. Can add `is_pending_review` in M9 if needed. |
| Image hosting on submit | URL-only (string in `gallery_urls`); Cloudinary upload lands in M4. | Avoids adding the Cloudinary SDK before M4. |
| Tests | Skip pytest for M2; verify by curl + manual run. | M9 is explicitly the testing milestone; adding pytest now would pre-empt that scope and pull in a new dep. |

## Scope — backend

### 1. New router: `backend/app/routers/destinations.py`

Mounted at `/api/destinations` in `main.py`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/destinations` | optional | Filtered, sorted, paginated list |
| GET | `/api/destinations/{id}` | optional | Detail with tags, media, rating aggregates, recents |
| GET | `/api/destinations/{id}/media` | optional | Paginated media |
| POST | `/api/destinations` | **required** | Submit new destination |
| GET | `/api/destinations/{id}/ratings` | optional | Paginated ratings list |
| POST | `/api/destinations/{id}/ratings` | **required** | Create / upsert rating (one per user per destination); recomputes `avg_rating` + `rating_count` |
| GET | `/api/destinations/{id}/cost-estimate` | optional | Per-user cost estimate (uses auth'd user's bike + home if available) |
| GET | `/api/tags` | optional | List tags grouped by category (for filter UX) |

#### `GET /api/destinations` query params

| Param | Type | Notes |
|---|---|---|
| `tags` | `list[str]` (slugs, vibe) | Any-of match by default |
| `vehicle_fit` | `list[str]` (slugs, vehicle_fit) | Any-of match |
| `radius_km` | float | Requires `from_lat`+`from_lng` OR authenticated user with `home_latitude`/`home_longitude` |
| `from_lat`, `from_lng` | float | Override origin; if omitted, fall back to current user's home |
| `max_budget` | int (INR) | Filter on `estimated_food_cost + estimated_entry_cost ≤ max_budget` |
| `q` | str | ILIKE on `name` and `region` |
| `sort` | enum: `rating` (default), `distance`, `popularity` | `distance` requires origin |
| `page` | int ≥ 1, default 1 | |
| `limit` | int 1..50, default 20 | |

Haversine implemented in SQL with `func.acos(...)` rather than PostGIS — keeps the M2 dep surface flat. See `PHASE3_PLAN.md §11` Haversine decision.

### 2. New service: `backend/app/services/cost_calculator.py`

```
def estimate_cost(
    destination: Destination,
    distance_km: float,
    bike_mileage_kmpl: float | None,
    fuel_price_inr_per_l: float | None = None,
) -> CostEstimate:
    fuel_price = fuel_price_inr_per_l or settings.FUEL_PRICE_INR_PER_L
    fuel_inr = round((2 * distance_km / mileage) * fuel_price) if mileage else None
    food = destination.estimated_food_cost or 0
    entry = destination.estimated_entry_cost or 0
    total_mid = (fuel_inr or 0) + food + entry
    return CostEstimate(
        distance_km=round(distance_km, 1),
        fuel_inr=fuel_inr, food_inr=food, entry_inr=entry,
        total_inr_low=round(total_mid * 0.8),
        total_inr_high=round(total_mid * 1.2),
        currency=destination.currency,
        assumptions={...}
    )
```

If `bike_mileage_kmpl` is missing (no bike record or no auth), return totals with `fuel_inr=None` and a note in `assumptions`.

### 3. New helper: `backend/app/services/geo.py`

`haversine_km(lat1, lng1, lat2, lng2) -> float` for in-Python distance use (cost estimate). The SQL version lives inline in the destinations router.

### 4. Config addition

`backend/app/config.py` gains `FUEL_PRICE_INR_PER_L: float = 105.0`.

### 5. Schema additions in `backend/app/schemas/destination.py`

- `DestinationListResponse` — `{ destinations: [DestinationSummary], total: int, page: int, limit: int }`
- `CostEstimate` — fuel/food/entry/total_low/total_high/currency/distance_km/assumptions
- `RatingListResponse` — `{ ratings: [RatingOut], total, page, limit }`
- `TagListResponse` — `{ vibe: [TagOut], vehicle_fit: [TagOut] }`
- Extend `DestinationOut` with: `recent_rider_count: int`, `recent_riders: list[UserBrief]` (reuse `schemas/ride.py::UserBrief`)
- Extend `DestinationCreate` with `gallery_urls: list[str] = []`
- New: `DestinationSubmissionResponse` mirrors `DestinationOut`

### 6. Frontend api client stub

Add typed methods to `frontend/src/lib/api.ts` (`listDestinations`, `getDestination`, `getDestinationMedia`, `submitDestination`, `listRatings`, `submitRating`, `getCostEstimate`, `listTags`). Type signatures only — no UI. Lets M3/M4 frontend hook in without re-touching the client. Per the UX track: no pages, no components.

### 7. Wire in `main.py`

`app.include_router(destinations.router, prefix="/api/destinations", tags=["Destinations"])` and add tags as a separate `/api/tags` mount (or expose under `destinations.router` — keeping it under destinations is fine).

## Out of scope (deferred)

- Map rendering (frontend UX track + Mapbox).
- Cloudinary media upload (M4).
- Destination discussion threads (M7).
- Moderation queue / admin (post-M9 if at all).
- Test suite (M9).
- Weighted ranking score (M9 if requested).

## Verification plan (no pytest in M2)

After implementation:

1. `./run.sh` boots DB + applies migrations + seeds.
2. Curl spot-checks:
   - `GET /api/destinations` → 5 destinations from seed
   - `GET /api/destinations?tags=mountain` → filtered subset
   - `GET /api/destinations?sort=rating` → ordered
   - `GET /api/destinations?from_lat=12.97&from_lng=77.59&radius_km=100&sort=distance` → Nandi Hills first
   - `GET /api/destinations?max_budget=400` → only cheap entries
   - `GET /api/destinations/{id}` → tags + media + recents (recents=0 until M3 logs exist)
   - `POST /api/destinations/{id}/ratings` (auth) → 200, repeat → upsert, avg + count update
   - `GET /api/destinations/{id}/cost-estimate` (auth, with bike) → numbers populated
   - `POST /api/destinations` (auth) with tag slugs → 201, listed in subsequent GET
   - `GET /api/tags` → grouped categories

## Files touched

**New:**
- `backend/app/routers/destinations.py`
- `backend/app/services/cost_calculator.py`
- `backend/app/services/geo.py`

**Modified:**
- `backend/app/main.py` (include router)
- `backend/app/config.py` (FUEL_PRICE_INR_PER_L)
- `backend/app/schemas/destination.py` (response wrappers + recents fields + gallery_urls)
- `frontend/src/lib/api.ts` (typed client methods only)

**Not modified:** Models (no schema migration needed — all tables exist from M1).

## Exit criteria (from PHASE3_PLAN.md)

> User can filter destinations by tag + radius + vehicle + budget, see a ranked list, and open a detail page with a map.

The "with a map" portion ships when the frontend UX track lands. Backend completes the data side: list + filters + ranked sort + detail w/ tags/media/rating/recents + cost estimate + submission + rating.

## Frontend debt opened by M2

- Destination discovery UI (list page, filter UX, detail layout, map) — deferred to UX session.
- `home_latitude`/`home_longitude` capture in signup/profile is partially there from M1; the cost-estimate endpoint needs them to be populated for the default-origin case to work. Profile page already needs M2 updates per `project_m1_frontend_debt`.

## Frontend debt closed by M2

None — M2 doesn't ship any UI. Profile-page M1 debt still open.

## Audit deferrals — recorded posture (from second-pass audit, 2026-05-24)

The second-pass audit (`docs/review/phase3-m2-destination-discovery-audit.md`)
surfaced six items deliberately deferred. Captured here so the next reviewer
doesn't re-litigate.

- **Currency policy (audit #10):** Cost calculator and `CostEstimate` are
  INR-only. `POST /api/destinations` rejects non-INR submissions (400). Re-open
  when there's a real multi-currency requirement; until then, `INR` is the
  single source of truth and field names are currency-neutral
  (`fuel` / `food` / `entry` / `total_low` / `total_high`).
- **Ranking math (audit #19):** `sort=popularity` is `rating_count DESC,
  avg_rating DESC`. Fresh destinations start at zero and rank last — accepted
  for M2's tiny dataset (5 seeded destinations). When the destination table
  grows, add a `sort=trending` mode backed by either an on-the-fly
  `COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')` or a
  denormalized `recent_rating_count_30d` column. Don't redefine `popularity`.
- **Rating privacy (audit #27):** `GET /ratings` returns full `UserBrief`
  (id, name, avatar) without auth. Phase 3 spec accepts this — "everything is
  public." When the follow system (M6) or any privacy gate lands, revisit by
  (a) requiring auth on the ratings endpoint and/or (b) adding
  `Rating.is_anonymous` so reviewers can opt out.
- **JWT hardening (audit #3):** Default `SECRET_KEY`, no `iss`/`aud` claims,
  no `require=[exp,sub]` on decode. Explicitly M9's "auth hardening" milestone
  — see `PHASE3_PLAN.md §4.1 item 10`. Don't pre-empt.
- **CORS (audit #14):** `allow_origins=["http://localhost:3000"]` is hardcoded.
  Pre-existing from M0, not introduced by M2. Production deploy gate; M9 will
  parameterize via `ALLOWED_ORIGINS` env.
- **Rate limiting / submission cap (audit #25):** `POST /api/destinations` has
  no per-user cap. Academic-project scope — moderation tooling is explicitly
  out of Phase 3. Once we have admin tools (post-M9), revisit with `slowapi`
  or a row-count precheck.
- **Migration safety (audit #30, applied):** M1 `downgrade()` now refuses
  unless `ALLOW_DESTRUCTIVE_DOWNGRADE=1` is set. `./run.sh reset` remains the
  documented recovery path.

## Audit fixes landed (cumulative across both audit passes)

First-pass: #1 (atomic rating upsert), #2 (re-fetch after POST submit),
#3 (recent-rider dedup), #4 (pagination tiebreaker), #5 (filter-slug 400),
#6 (DestinationCreate bounds), #7 (currency-neutral cost fields + INR submit
gate), #8 (unified Haversine), #11 (validate tags pre-flush + dedup),
#12 (cost-estimate `fuel_included` flag), #13 (frontend error normalization),
#18 (eager-load rating user), #20 (shared `EARTH_RADIUS_KM`),
#22 partial (`UserBrief` moved to `schemas/user`).

Second-pass: #22 finish (drop unused `UserBrief` reexport from
`schemas/ride`), #26 (lat/lng bounds on `UserUpdate` + `SignupRequest`),
#13 + #24 + #28 (ILIKE escaping, empty-list cleanup, `q` min length + strip),
#23 (drop superfluous `cast()` in SQL Haversine), #29 (redundant `db.refresh`
already gone from first-pass rewrite), #30 (M1 downgrade guarded).

**Audit #2 reviewed as a false positive in practice:** FastAPI's
`Depends(get_db)` caching dedupes the session within a single request, so
`get_optional_user` does not open a second session for M2 endpoints (which all
already depend on `get_db`). The proposed "lazy session" refactor would
actually *worsen* the authenticated path (2 sessions per request) without
helping the anonymous path. No change made.
