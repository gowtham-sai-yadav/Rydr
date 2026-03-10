# Phase 3 / M2 — Destination Discovery — Production Engineering Audit

**Branch:** `feat/implementation1`
**Base commit:** `b329170`
**Audit date:** 2026-05-24
**Reviewer:** Production audit pass (second iteration with deeper coverage)

This audit is the deep production-readiness pass on the M2 destination-discovery
PR. The first pass surfaced 22 issues; this second pass re-reads the same code
plus indirectly impacted modules and adds findings that were missed.

## Files in scope (touched directly or indirectly)

**Modified by the PR (`git status` on `feat/implementation1`):**

| File | Change |
|---|---|
| `backend/app/config.py` | Adds `FUEL_PRICE_INR_PER_L` |
| `backend/app/dependencies.py` | Adds `optional_security` + `get_optional_user` |
| `backend/app/main.py` | Mounts `destinations`, `tags` routers |
| `backend/app/schemas/destination.py` | Adds list/rating-list/cost-estimate/tag-grouped wrappers, `recent_riders*`, `gallery_urls`, `CostEstimate` |
| `frontend/src/lib/api.ts` | Adds 10 new M2 client methods |
| `docs/plan/m2-destination-discovery.md` | Finalized plan |

**Added by the PR:**

| File | Purpose |
|---|---|
| `backend/app/routers/destinations.py` | List / detail / submit / media / rating / cost-estimate |
| `backend/app/routers/tags.py` | Grouped tag listing |
| `backend/app/services/cost_calculator.py` | Per-user fuel/food/entry estimate |
| `backend/app/services/geo.py` | In-Python Haversine |

**Indirectly impacted (read for context, not modified):**
`backend/app/models/{destination, user, ride, ride_log}.py`,
`backend/app/schemas/{ride, user}.py`,
`backend/app/services/auth_service.py`,
`backend/app/dependencies.py` callers (`auth`, `users`, `rides`, `chat`),
`backend/app/database.py`, `backend/app/main.py`,
`backend/alembic/versions/b4e6c8f2a1d3_m1_destination_schema.py`,
`frontend/src/lib/{api, constants}.ts`.

---

## Findings — ordered by severity, then by blast radius

---

### 1. Rating upsert is a check-then-insert race — concurrent submits 500 and corrupt aggregates

**Severity: Critical**

Description :
`POST /api/destinations/{id}/ratings`
(`backend/app/routers/destinations.py:421-461`) first queries for an existing
rating row, then either updates it or inserts a new one. Two concurrent
requests from the same user (double-tap on mobile, automatic retry, two
browser tabs) both pass the "row not found" check and both insert; the second
hits `uq_rating_destination_user` and raises an unhandled `IntegrityError`
that FastAPI surfaces as HTTP 500. The same race causes
`_recompute_rating_aggregates` to compute on inconsistent state — `avg_rating`
on the destination row can disagree with `AVG(stars)` until the next rating
arrives.

Required Fixes :
Replace the check-then-insert pattern with an atomic
`postgresql.insert(Rating).on_conflict_do_update(...)` keyed on the unique
constraint, returning the row. Move `_recompute_rating_aggregates` into the
same transaction and lock the destination row with
`SELECT ... FOR UPDATE` (or
`pg_advisory_xact_lock(hashtext(destination_id::text))`) before the recompute
so two parallel writes serialize on the destination. Catch `IntegrityError`
and map it to 409. Add a regression test that spawns N concurrent threads
posting ratings for the same `(user, destination)` and asserts:
(a) no 500s, (b) exactly one row in `ratings`, (c) `destinations.avg_rating
== AVG(ratings.stars)` after the burst.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (if a SQL-side recompute helper is added)
- backend/tests/test_ratings_concurrent.py (new)

---

### 2. `get_optional_user` checks out a DB session for every anonymous request

**Severity: Critical**

Description :
`get_optional_user` (`backend/app/dependencies.py:43-64`) declares
`db: Session = Depends(get_db)` as a peer dependency, so FastAPI resolves the
DB dependency **before** the function body runs and the early-return on
`credentials is None` fires. Every anonymous request to
`/api/destinations`, `/api/destinations/{id}`, `/api/destinations/{id}/media`,
`/api/destinations/{id}/cost-estimate` (and `/api/rides/feed` etc. via the
same dep) checks out a SQLAlchemy session it never uses. A typical homepage
load (1 list + ~5 detail prefetches + tags) is ~7 wasted sessions per
anonymous visitor; under any moderate burst this drains `pool_size +
max_overflow` and starves authenticated traffic. There is no current pool
sizing tuning in `database.py` (defaults to pool_size=5, max_overflow=10), so
the failure threshold is low.

Required Fixes :
Restructure `get_optional_user` so the DB session is only opened when a token
is present: either drop the `Depends(get_db)` peer and construct
`SessionLocal()` locally inside an `if credentials is not None:` block with a
`try/finally db.close()`, or move the JWT decode out of the dep entirely and
have a small helper that the route handler calls when it actually needs
personalization. Also explicitly configure
`create_engine(..., pool_size=20, max_overflow=20, pool_pre_ping=True)` in
`database.py` and surface those as env-tunable settings. Load test: 100
concurrent anonymous GETs vs. 100 concurrent authenticated POSTs — verify
session pool high-water mark stays below cap and no requests time out.

Required Files Changes :
- backend/app/dependencies.py
- backend/app/database.py
- backend/app/config.py (pool sizing env)
- backend/tests/test_optional_auth_no_db.py (new)

---

### 3. JWT verification trusts default secret + lax claim requirements

**Severity: Critical**

Description :
`backend/app/config.py:6` ships `SECRET_KEY = "super-secret-key-change-in-production"`
as a default. Both `get_current_user` and `get_optional_user` call
`jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])` —
no `options={"require": ["exp", "sub"]}`, no audience/issuer pinning, no
startup check for the default secret. M2 widens the surface by exposing
optional-auth on **public** endpoints, so the default secret blast radius
now includes personalization for any caller, not just logged-in flows.
A token minted by anyone who guesses or sees this default unlocks any
account.

Required Fixes :
Fail fast in `config.py`: if `SECRET_KEY` equals the placeholder and the
detected environment is not `dev`/`test`, raise on import. Add `iss`/`aud`
claims in `create_access_token` (`services/auth_service.py:29-35`) and pass
`audience=...`, `issuer=...`, and
`options={"require": ["exp", "sub", "iss", "aud"]}` to both `jwt.decode`
calls. Replace the naive `datetime.utcnow()` with `datetime.now(timezone.utc)`
so `exp` matches the timezone-aware claim verifier. Treat expired tokens on
optional endpoints as anonymous, but log the event so silent
personalization drop-off is observable. Regression tests: tokens minted with
no `exp`, with `alg=none`, with wrong audience, with a tampered signature —
all must be rejected; `get_optional_user` returns `None` for invalid/expired
and decodes for valid; startup with default secret raises in non-dev envs.

Required Files Changes :
- backend/app/config.py
- backend/app/dependencies.py
- backend/app/services/auth_service.py
- backend/tests/test_jwt_hardening.py (new)

---

### 4. SQL Haversine vs. Python Haversine are different formulas — boundary results flip

**Severity: Major**

Description :
`_haversine_sql` (`backend/app/routers/destinations.py:70-82`) actually
implements the **spherical-law-of-cosines** formula
(`R · acos(sin·sin + cos·cos·cos(Δλ))`), not Haversine. The in-Python
`haversine_km` in `services/geo.py:14-19` is the actual Haversine. Their
outputs disagree by centimetres in mid-latitudes and by larger amounts near
the antipodes. The list endpoint filters with the SQL version, then *re-
computes* `distance_km` per row in Python with Haversine — so a destination
sitting on the `radius_km=100` boundary can be included by the filter
(99.97 km in SQL) and rendered with `"distance_km": 100.05` in the response,
which looks like a bug to a power user zooming in on the edge.
`EARTH_RADIUS_KM = 6371.0088` is also duplicated in both files, inviting
drift.

Required Fixes :
Rewrite `_haversine_sql` as a true Haversine
(`2·R·asin(sqrt(sin²(Δφ/2) + cos·cos·sin²(Δλ/2)))`), drop the unnecessary
`func.cast(origin_lat, Float)` and the `least/greatest` clamp (Haversine
doesn't need it because `a ∈ [0, 1]`), and move the function into
`services/geo.py` as a free function returning a SQLAlchemy
`ColumnElement[float]`. Import a single `EARTH_RADIUS_KM` constant.
Add a parity test that picks 50 lat/lng pairs and asserts SQL and Python
distances agree to within 1 mm. Verify the `radius_km` boundary returns the
same set of rows from both code paths.

Required Files Changes :
- backend/app/services/geo.py
- backend/app/routers/destinations.py
- backend/tests/test_distance_parity.py (new)

---

### 5. Pagination has no stable tiebreaker — pages skip / repeat rows on ties

**Severity: Major**

Description :
`list_destinations`, `list_destination_media`, and `list_ratings` order by
non-unique columns (`avg_rating, rating_count`, `created_at`, or
`distance_expr`) with no `Destination.id` (or row-id) tiebreaker. Postgres
returns ties in physical order, which is unstable across queries — so the
same destination/rating/media row can show up on both page 1 and page 2
(or vanish from both) once data accumulates. The same defect appears in
`/api/rides/feed` (ordered by `planned_date, planned_start_time, id` — that
one is correct; `_haversine_sql` ones are not).

Required Fixes :
Append `Destination.id.asc()` (or `Rating.id.asc()`,
`DestinationMedia.id.asc()`) as the final clause of every `order_by` in
`backend/app/routers/destinations.py`. Codify "every paginated list ends in
a stable id tiebreaker" in a short helper or in the milestone README. For
discoverability-heavy endpoints, plan a keyset-pagination follow-up
(`WHERE (rating, id) < (:last_rating, :last_id)`) — offset gets quadratic
past page ~50. Tests: seed N destinations with identical `avg_rating`,
iterate pages with `limit=2`, assert union of pages equals full set with
zero duplicates.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_pagination_stability.py (new)

---

### 6. `gallery_urls` and `DestinationCreate.latitude/longitude` have no validation

**Severity: Major**

Description :
`DestinationCreate` in `backend/app/schemas/destination.py:112-127` declares
`latitude: float` / `longitude: float` with **no range constraint**, while
the same params on the **list** endpoint are bounded `ge=-90/le=90`. Any
authenticated user can submit `latitude=12345.6` and it lands in the DB,
poisoning every subsequent distance query. `gallery_urls: List[str] = []`
has no length cap and no URL validation; a single POST can insert thousands
of `DestinationMedia` rows, each url constrained only at the DB layer
(`String(500)`) — a 501-char URL crashes the request as a 500. Same problem
for `tag_slugs` (no cap, no dedupe — duplicates cause PK violations and 500
when inserted into `destination_tags`).

Required Fixes :
Tighten `DestinationCreate`: `latitude: float = Field(ge=-90, le=90)`,
`longitude: float = Field(ge=-180, le=180)`,
`tag_slugs: List[str] = Field(default_factory=list, max_length=20)`,
`gallery_urls: List[HttpUrl] = Field(default_factory=list, max_length=20)`,
and a `field_validator` that lowercases + dedupes `tag_slugs`. Add
`max_length=2000` on `RatingCreate.review` so the `Text` column doesn't
take 10 MB blobs. Constrain `currency` to `pattern="^[A-Z]{3}$"`. Tests:
out-of-range coords return 422; 21-entry gallery returns 422; duplicate
slugs are silently deduped or rejected; oversize review returns 422.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/tests/test_destination_validation.py (new)

---

### 7. `submit_destination` flushes the row *before* validating tags / urls

**Severity: Major**

Description :
`backend/app/routers/destinations.py:294-323` runs `db.add(dest);
db.flush()` (issuing `INSERT INTO destinations` inside the transaction)
**before** querying for tag existence — if any tag slug is unknown, the
handler raises `HTTPException(400)`. The eventual session-close rollback
clears the inserted row today, but the pattern is fragile: any future
trigger / audit-log table / partial index sees the row mid-flight. The
unique-id allocation also burns a UUID v4 for nothing. The same handler
adds `DestinationMedia` rows in a loop with no validation, so a 501-char
URL or a duplicate `tag_slug` raises `IntegrityError` after the destination
is already inserted — the rollback still wipes everything but the user gets
a 500 with no actionable message.

Required Fixes :
Reorder: validate `tag_slugs` against the DB (resolving the `tag_rows`),
validate `gallery_urls` against the schema-level constraints (see
finding 6), reject duplicates and unknown slugs **before** constructing the
`Destination`. Wrap the whole handler in an explicit
`with db.begin():` block for an explicit rollback boundary. Map
`IntegrityError` to 409. Tests: unknown tag returns 400 with zero rows
written (`SELECT COUNT(*) FROM destinations` unchanged); duplicate tag
slug returns 422; oversize gallery url returns 422; happy path returns
201 with `tags` and `media` populated.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_submit.py (new)

---

### 8. N+1 query on POST and lazy-load risk on detail

**Severity: Major**

Description :
`submit_destination` (`backend/app/routers/destinations.py:328-329`) calls
`db.refresh(dest)` then `_serialize_detail(db, dest)`. `refresh()` reloads
column state only — it does **not** eager-load `dest.tags` or `dest.media`.
The subsequent iteration in `_serialize_detail` lazy-loads `dest.tags`
(1 query), `dt.tag` for each `DestinationTag` (N queries — eight tags = 8
extra round trips), and `dest.media` (1 query). A submit with 8 tags + 12
gallery items is ~22 SQL statements per request. Worse, after `db.commit()`
the session is in `expire_on_commit=True` state, so the lazy-load could fail
in some configurations (`DetachedInstanceError`) if the session were
already closed.

Required Fixes :
After `db.commit()` in `submit_destination`, re-fetch the row via
`_load_destination_or_404(db, dest.id)` — that helper already applies
`selectinload(Destination.tags).selectinload(DestinationTag.tag),
selectinload(Destination.media)`. Alternatively, attach `lazy="selectin"`
to `Destination.tags`, `DestinationTag.tag`, and `Destination.media` for
hot paths. Add a SQL-statement-count assertion in tests
(`event.listen(engine, "before_cursor_execute", counter)`) capping detail /
POST responses at ≤ 4 queries. Edge cases: zero-tag destination, zero-media
destination, mixed payloads, very large media arrays.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (optional eager-load defaults)
- backend/tests/test_destination_query_count.py (new)

---

### 9. Recent-rider preview duplicates the same user

**Severity: Major**

Description :
`_recent_riders` (`backend/app/routers/destinations.py:98-133`) uses
`func.count(distinct(RideLog.rider_id))` for the count — correct — but the
preview query selects `User` JOIN-ed against `RideLog` *without* `DISTINCT`
and ordered by `RideLog.actual_end_ts.desc()`. A rider who completed two
trips in the 90-day window appears twice in the 3-item preview. UI then
shows "Alice · Alice · Bob" alongside a "12 riders" badge — credibility
hit on every popular destination card.

Required Fixes :
Rewrite the preview query to deduplicate by rider_id while keeping the
"most recent first" order. Postgres-friendly approach:
`SELECT DISTINCT ON (u.id) u.*, rl.actual_end_ts FROM users u JOIN
ride_logs rl ON rl.rider_id = u.id JOIN ride_plans rp ON rp.id =
rl.ride_plan_id WHERE rp.destination_id = :id AND rl.actual_end_ts >
:since ORDER BY u.id, rl.actual_end_ts DESC`, then wrap in an outer query
that reorders by `actual_end_ts DESC LIMIT 3`. Collapse the count and
preview into a single CTE to avoid two round-trips on every detail view.
Tests: rider with 5 RideLogs → returns once; multiple riders, mixed window;
no riders → empty list and count 0.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_recent_riders.py (new)

---

### 10. Cost estimate fields are INR-named but the destination currency is read-through

**Severity: Major**

Description :
`CostEstimate` (`backend/app/schemas/destination.py:158-166`) hardcodes
`fuel_inr`, `food_inr`, `entry_inr`, `total_inr_low/high` while
`estimate_cost` (`backend/app/services/cost_calculator.py:21-56`) simply
copies `destination.currency` into the response and applies
`FUEL_PRICE_INR_PER_L` unconditionally. The data model already supports
arbitrary `currency` strings, so an authenticated user can submit a USD
destination and receive `{"fuel_inr": 1200, ..., "currency": "USD"}` — the
*values* are in destination currency but the field *names* still claim INR,
and the fuel multiplier is wrong (₹105/L applied to a USD-priced bike).

Required Fixes :
Either restrict `Destination.currency` to `INR` until multi-currency lands
(reject submission with 400 otherwise), or rename `CostEstimate` fields to
generic `fuel`, `food`, `entry`, `total_low`, `total_high`, and surface
the fuel-price unit in `assumptions` as `fuel_price` keyed by currency.
Propagate the rename to `frontend/src/lib/api.ts` (and add proper TS types
— see finding 16). Tests: a non-INR destination either 400s or returns a
currency-consistent response.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/services/cost_calculator.py
- backend/app/routers/destinations.py
- frontend/src/lib/api.ts
- backend/tests/test_cost_estimate.py (new)

---

### 11. Cost estimate silently sets fuel to zero when bike mileage is missing — totals lie

**Severity: Major**

Description :
`cost_calculator.estimate_cost` line 46 computes
`total_mid = (fuel_inr or 0) + food + entry`. When the user has no bike
or no mileage, `fuel_inr` is reported as `None`, but `total_inr_low/high`
are still computed as `±20%` of `food + entry`. The user sees
"₹240–₹360" for a 400 km round trip because their bike profile is missing —
an order of magnitude off. The `assumptions.fuel_excluded_reason` hint is
buried inside a dict and unlikely to surface in the UI.

Required Fixes :
When `fuel_inr is None`, return `total_inr_low = None`,
`total_inr_high = None`, and add a top-level `fuel_included: bool` field on
`CostEstimate` so the UI renders an explicit "add your bike to see a fuel
estimate" CTA. Alternatively fall back to a documented default mileage
(e.g. 35 kmpl) and surface it loudly in `assumptions`. Tests: user with no
bike → totals None + flag false; user with bike but mileage=0 → same;
user with bike+mileage → numeric totals; explicit query override beats user
record.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/services/cost_calculator.py
- frontend/src/lib/api.ts (typed response shape)
- backend/tests/test_cost_estimate_missing_bike.py (new)

---

### 12. Tag filter silently drops unknown slugs

**Severity: Major**

Description :
`list_destinations` uses `Tag.slug.in_(tags)` inside an `EXISTS` subquery
(`backend/app/routers/destinations.py:214-236`). The plan doc explicitly
states tags are "any-of" — so OR semantics are correct. But an *unknown*
slug (typo, stale frontend chip, deprecated tag) is silently absorbed: the
filter still applies and just matches fewer rows. A buggy frontend that
sends `tags=["sceenic"]` (typo) returns the empty result set without any
hint, and the user wonders why "no destinations match." The same applies
to `vehicle_fit`.

Required Fixes :
Validate every incoming slug against `tags.slug` up-front with a single
`SELECT slug FROM tags WHERE slug IN :slugs AND category = :cat`. If any
slug is missing from the result, return 400 with the offending list.
Also cap the number of accepted slugs at 20 to keep query plans cheap.
Tests: known slug → match; unknown slug → 400; mixed known+unknown →
400; over-limit → 422; empty list → unfiltered.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_filters.py (new)

---

### 13. ILIKE search on `q` does not escape wildcard characters

**Severity: Major**

Description :
`backend/app/routers/destinations.py:244-248` builds the search pattern as
`like = f"%{q}%"` and passes it to `Destination.name.ilike(like)`. A user
input like `100%` or `_` is interpreted as a SQL `LIKE` wildcard, so
`q="A_B"` matches "AaB", "AbB", "AcB", etc., and `q="%"` matches every
destination. Not an injection (parameterized), but a confusing UX bug and
a soft DoS — a search for `%` triggers a sequential scan of the whole
table. The column also has no `pg_trgm` GIN index, so even non-pathological
searches go sequential past ~10k rows.

Required Fixes :
Escape `%`, `_`, and `\` in `q` before wrapping in `%...%`
(`q = q.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")`) and
use `.ilike(like, escape="\\")`. Strip leading/trailing whitespace; reject
queries that are entirely wildcards after escaping. Add an Alembic
migration that enables `pg_trgm` and creates GIN trigram indexes on
`destinations.name` and `destinations.region`. Tests: `q="100%"` does
**not** match "100 Roads"; `q="_"` matches literal underscores only; long
queries still complete under 200 ms with the trigram index.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/alembic/versions/{new}_destinations_trgm.py (new)
- backend/tests/test_destination_search.py (new)

---

### 14. CORS only allows `http://localhost:3000` — every deployed environment 404s the frontend

**Severity: Major**

Description :
`backend/app/main.py:8-14` hardcodes `allow_origins=["http://localhost:3000"]`.
This PR adds the first **public** API surface (anonymous browsing of
destinations) — when the frontend is deployed to Vercel/Netlify/IPS, every
M2 endpoint will fail CORS preflight in the browser. The plan calls out
"frontend deferred" but the API contract is shipping now and any external
caller (mobile app, partner integration, even staging frontends) will be
blocked. Compounding this, `pydantic-settings 2.x` deprecated the inner
`class Config: env_file = ".env"` pattern used here in favour of
`model_config = SettingsConfigDict(env_file=".env")` — emits a
DeprecationWarning on every startup.

Required Fixes :
Read `ALLOWED_ORIGINS` from settings as a comma-separated env var with a
local default; in `main.py`, split that into the `allow_origins` list.
Also migrate `Settings.Config` to `model_config = SettingsConfigDict(...)`
to silence the deprecation. Document the env var in `.env.example`.
Tests: unknown origin is blocked; configured origin passes; the
deprecation warning no longer appears on `uvicorn` start.

Required Files Changes :
- backend/app/config.py
- backend/app/main.py
- backend/.env.example (if present) or docs/plan/m2-destination-discovery.md

---

### 15. Frontend renders FastAPI validation errors as `[object Object]`

**Severity: Major**

Description :
`frontend/src/lib/api.ts:18-25` does
`throw new Error(body.detail || `Request failed: ${res.status}`)`. FastAPI
422 validation errors return `detail` as an **array** of
`{loc, msg, type}` objects; passing an array to `new Error(...)` coerces
to `"[object Object],[object Object]"`. Every form that the PR newly
exposes (`submitDestination`, `submitRating`, `getCostEstimate` with
missing origin) will render this garbage string into the toast/alert
component, making real validation feedback useless.

Required Fixes :
Normalize the error body in `request<T>`: if `detail` is an array, map to
`detail.map(d => `${(d.loc ?? []).join('.')}: ${d.msg}`).join('; ')`;
if it's a string, use as-is; otherwise fall back to
`Request failed: ${status}`. Optionally wrap into an `ApiError` class with
`status`, `code`, `fields` so per-field form errors can be highlighted.
Tests: a 422 from `submitDestination` renders a human-readable
"latitude: input should be less than or equal to 90" string.

Required Files Changes :
- frontend/src/lib/api.ts
- frontend/src/__tests__/api.error-shape.test.ts (new)

---

### 16. Frontend has no types, no abort, no in-flight dedupe

**Severity: Major**

Description :
All ten new methods in `frontend/src/lib/api.ts:138-217` return
`Promise<unknown>`, pushing type assertions onto every caller and
guaranteeing future drift between schema and consumer. There is no
`AbortController` plumbing, so a user rapidly cycling filter chips will
issue 5 concurrent `listDestinations` calls and the *last to resolve*
wins, not the *most recently requested* — the classic flickering-filter
bug. Component unmount during a fetch causes "setState on unmounted
component" warnings. There is also no auth-refresh hook; a 401 from
`get_optional_user` (e.g. expired token) silently downgrades to
anonymous personalization without telling the user.

Required Fixes :
Create `frontend/src/lib/api.types.ts` mirroring every Pydantic schema
(`DestinationListResponse`, `DestinationOut`, `CostEstimate`,
`TagListResponse`, `RatingListResponse`, `DestinationMediaListResponse`).
Have each method return the typed promise. Plumb an `AbortSignal` through
`request<T>` and accept one in every list method, then cancel-on-rerun in
the consuming components. For dedupe / stale-while-revalidate, adopt
`@tanstack/react-query` or `swr`. Detect 401 on authenticated paths and
prompt re-login. Tests: rapid filter changes only render the most-recent
result; unmount during fetch is silent; 401 triggers a documented hook.

Required Files Changes :
- frontend/src/lib/api.ts
- frontend/src/lib/api.types.ts (new)
- frontend/src/__tests__/api.cancel.test.ts (new)

---

### 17. `_serialize_detail` enumerates every field by hand → silent drift risk

**Severity: Minor**

Description :
`backend/app/routers/destinations.py:147-178` builds `DestinationOut` by
listing 20+ columns explicitly. When M9 / M10 add a new column (e.g.
`avg_recommend_pct`, `is_pending_review`, `submitted_count`), the new
field will silently disappear from the response until someone remembers
to update this function. Worse, the same payload-builder pattern is now
copy-pasted in `rides.py::_build_detail_response`.

Required Fixes :
Build the body with `DestinationOut.model_validate(destination)` and then
attach the two computed fields (`recent_rider_count`, `recent_riders`)
via `model_copy(update={...})`. Ensure relationships are eager-loaded
(see finding 8). Add a regression test that imports the SQLAlchemy model
columns and the Pydantic schema fields and asserts every model column has
a corresponding schema field (or is in an explicit allow-list of
internal-only fields).

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_schema_model_parity.py (new)

---

### 18. `RatingOut.user` lazy-loads on every submit response

**Severity: Minor**

Description :
`list_ratings` correctly applies `.options(selectinload(Rating.user))`,
but `create_or_update_rating` finishes with
`RatingOut.model_validate(rating)` after `db.refresh(rating)` — refresh
does not load relationships, so accessing `rating.user` triggers a SELECT
per request. Trivial individually, but the rating-submit path is one of
the hottest write endpoints in the discovery loop.

Required Fixes :
After `db.refresh(rating)`, re-query with
`db.query(Rating).options(selectinload(Rating.user)).get(rating.id)`,
or set `lazy="joined"` on `Rating.user` since ratings are almost always
read with their author. Verify with a query-count assertion (≤ 3 SQL
statements per POST).

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (optional)

---

### 19. `popularity` sort = `rating_count DESC` → fresh destinations frozen out

**Severity: Minor**

Description :
`sort=popularity` orders by `(rating_count DESC, avg_rating DESC)`. New
destinations start at `rating_count=0` and never surface, so the popularity
feed converts into "whatever was seeded first." Without a recency window
the M2 discovery loop becomes self-confirming — popular things stay
popular because they're the only thing the homepage shows.

Required Fixes :
Add a `recent_rating_count_30d` denormalized column on `Destination`
(updated inside the same transaction as `_recompute_rating_aggregates`),
or compute it on-the-fly via
`COUNT(rating) FILTER (WHERE created_at > now() - interval '30 days')`.
Expose as a separate `sort=trending` mode rather than redefining
popularity. Document the ranking math in
`docs/plan/m2-destination-discovery.md`. Tests: a fresh destination with
one recent rating outranks a stale one with five old ones.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py
- docs/plan/m2-destination-discovery.md

---

### 20. `EARTH_RADIUS_KM` constant duplicated across two modules

**Severity: Minor**

Description :
The Earth radius constant is declared in both
`backend/app/services/geo.py:11` and
`backend/app/routers/destinations.py:62`. Combined with the formula
divergence in finding 4, this is a drift surface.

Required Fixes :
Keep `EARTH_RADIUS_KM` only in `services/geo.py`; import it in the router.
When you move the SQL Haversine into `geo.py` (finding 4), this folds
in for free.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/services/geo.py

---

### 21. `/api/tags` returns flat groups with no total / no cap

**Severity: Minor**

Description :
`backend/app/routers/tags.py:17-27` fetches every row from `tags`,
groups in Python, and returns. No total field on `TagListResponse`, no
soft cap on the SELECT. At ~20 tags today this is fine, but the moment a
seed bug or admin tool mass-inserts tags, the endpoint dumps the whole
table in one shot.

Required Fixes :
Add `total: int` to `TagListResponse`. Add a `LIMIT 200` safety net to the
query. When the tag count exceeds the UX chip threshold, switch to a
typeahead `?q=` server-side search. Tests: empty `tags` table returns
empty groups + total=0; large tag table is capped at 200.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/routers/tags.py

---

### 22. `UserBrief` imported from `schemas/ride` into `schemas/destination` (deprecated path)

**Severity: Minor**

Description :
`backend/app/schemas/destination.py:15` imports `UserBrief` from
`schemas/ride`, even though `UserBrief` was relocated to `schemas/user`
(see `backend/app/schemas/user.py:19-25` — it's now the canonical home
and the docstring explicitly says so). The destination domain now depends
on the ride domain for a generic user DTO; as M3 reshapes
`schemas/ride`, every import there becomes a load-bearing reexport.

Required Fixes :
Change `backend/app/schemas/destination.py:15` and
`backend/app/routers/destinations.py:55` to import `UserBrief` from
`app.schemas.user`. Drop the back-compat reexport in `schemas/ride.py`
once all consumers move. Grep the codebase for `from app.schemas.ride
import UserBrief` and update every hit in one PR.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/routers/destinations.py
- backend/app/schemas/ride.py (drop reexport)

---

### 23. `_haversine_sql` uses an unnecessary `cast(... Float)` — no-op CPU

**Severity: Minor**

Description :
`backend/app/routers/destinations.py:72-75` wraps `origin_lat` and
`origin_lng` in `cast(..., Float)`. SQLAlchemy already binds Python
floats as `float8` parameters; the cast adds a layer of SQL
(`RADIANS(CAST($1 AS double precision))`) that the planner has to strip.
Negligible cost, but it muddies the query plan when debugging.

Required Fixes :
Drop the `cast()` calls — pass `origin_lat` and `origin_lng` directly to
`func.radians(...)`. Verify the generated SQL with
`echo=True` on the engine.

Required Files Changes :
- backend/app/routers/destinations.py

---

### 24. `q=` empty-string param silently disables search but still hits ILIKE

**Severity: Minor**

Description :
`if q:` short-circuits on `q=""` (`backend/app/routers/destinations.py:244`),
which is the right behaviour — but a request like `?q=` (empty value)
parses to `q=""` and bypasses the search filter. Combined with finding 13,
a query of `?q=%` returns *every* destination. The plan doc treats `q` as
a free-text search, so silently treating empty / whitespace-only / pure-
wildcard inputs as "match everything" leaks all destinations to a curious
caller scraping the API.

Required Fixes :
After escaping wildcards (finding 13), `q = q.strip()`; if the result is
empty after stripping wildcards/punctuation, skip the filter as today.
Add a minimum length (e.g. `len(q.strip()) >= 2`) to avoid scanning the
full table for one-letter queries. Tests: `?q=` returns the unfiltered
listing (current behaviour explicit), `?q=%25%25` returns no special-case
match, `?q=a` returns nothing if min length is 2.

Required Files Changes :
- backend/app/routers/destinations.py

---

### 25. POST `submit_destination` is unrated and uncapped — submission DoS

**Severity: Minor**

Description :
`POST /api/destinations` requires auth but has no rate limit and no
per-user submission cap. An authenticated user can spam thousands of
destinations, each with up to 20 gallery URLs (post finding 6), filling the
`destinations` and `destination_media` tables and bloating the homepage
feed. The plan doc treats moderation as out of scope, but the lack of any
ceiling is a footgun once an external user account is compromised.

Required Fixes :
Add a per-user submission cap (e.g. ≤ 10/day) enforced in the handler
with a `COUNT(*) FROM destinations WHERE submitted_by_user_id = :u AND
created_at > now() - interval '24 hours'` precheck. Longer term, plug in
a rate-limit middleware (`slowapi`) at the app level. Tests: 11th
submission in 24 h returns 429.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/services/limits.py (new)
- backend/tests/test_destination_submit_limits.py (new)

---

### 26. `home_latitude` / `home_longitude` not validated on `users.PUT /me`

**Severity: Minor**

Description :
`UserUpdate` in `backend/app/schemas/user.py:60-67` declares
`home_latitude: Optional[float]` and `home_longitude: Optional[float]`
with no range constraint. `PUT /api/users/me` writes whatever number is
posted. The same value is then trusted by `get_optional_user → _resolve_origin
→ _haversine_sql` and `cost_calculator`. A user with `home_latitude=200`
will receive nonsense distances and cost estimates on every list/detail
call — the SQL `acos` will hit the `least/greatest` clamp and pin to 0,
which silently makes everything "0 km away" from their bogus home.
M2 is the first feature that *reads* these fields, so the bug surfaces
only now.

Required Fixes :
Mirror the bounds on `UserUpdate` (and on `SignupRequest`):
`home_latitude: Optional[float] = Field(default=None, ge=-90, le=90)`,
`home_longitude: Optional[float] = Field(default=None, ge=-180, le=180)`,
and require both-or-neither in a `model_validator`. Server-side validation
matters because the frontend isn't enforcing it either. Tests: PUT with
`home_latitude=200` returns 422; PUT with `home_latitude=12.5` without
longitude is rejected; valid pair updates cleanly.

Required Files Changes :
- backend/app/schemas/user.py
- backend/app/schemas/auth.py
- backend/tests/test_user_update_home.py (new)

---

### 27. `RatingOut.user` exposes raw user fields without privacy gate

**Severity: Minor**

Description :
`RatingOut.user: Optional[UserBrief]` returns `{id, name, avatar_url}` for
every rating. The plan doc accepts this as "everything is public in
Phase 3," but the auth model has no concept of "review anonymously" or
"deleted account" — a deleted user's name remains attached to ratings via
the `ondelete="CASCADE"` (so they vanish) but a soft-deleted future would
leak their identity. Surfacing the rider's full name + avatar on a
publicly-readable endpoint without auth (`list_ratings` has no auth dep)
also makes the dataset easy to scrape into a directory of riders.

Required Fixes :
Make `list_ratings` require optional auth so anonymous scrapers don't get
a free directory; record-level, decide whether `UserBrief` should be
`None` if the rater opted into anonymous (add `is_anonymous` on Rating in
a future migration). For now, document the privacy posture in the plan
doc, and add a `noindex` / `X-Robots-Tag: noindex` header on the route to
discourage search-engine ingest. Tests: rating list response respects
the eventual privacy flag.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/schemas/destination.py
- docs/plan/m2-destination-discovery.md

---

### 28. `tags=[]` and `vehicle_fit=[]` defaults vs. FastAPI `Query` list semantics

**Severity: Minor**

Description :
`tags: Optional[List[str]] = Query(default=None)` is correct, but FastAPI
parses `?tags=` (empty value) into `tags=['']`. The handler then runs
`Tag.slug.in_([''])` inside an `EXISTS`, which always returns false — so a
malformed frontend query like `?tags=` returns the empty result set, which
looks indistinguishable from "no destinations match the filter." Same
holds for `vehicle_fit`.

Required Fixes :
After parsing, filter out empty/whitespace-only entries from both `tags`
and `vehicle_fit`. If, after filtering, the list is empty, treat as `None`
(no filter). Combine with finding 12 (unknown slug → 400) so malformed
input either is fixed up or surfaces clearly. Tests: `?tags=` returns the
unfiltered listing.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_filters.py

---

### 29. `db.refresh(rating)` after upsert path silently re-loads on a closed session

**Severity: Minor**

Description :
`create_or_update_rating` calls `db.commit()` then `db.refresh(rating)`
(`backend/app/routers/destinations.py:459-460`). `expire_on_commit=True`
is on the SQLAlchemy default sessionmaker
(`backend/app/database.py:7`), so all attributes are expired after
commit. The refresh re-issues a SELECT for the rating; combined with
`RatingOut.model_validate(rating)` accessing `rating.user`, that's a
second SELECT. Two round trips per submit when one would suffice.

Required Fixes :
Replace `db.refresh(rating)` with a single
`rating = db.query(Rating).options(selectinload(Rating.user)).get(rating.id)`
after commit (this also fixes finding 18). Or set
`expire_on_commit=False` on `SessionLocal` — most FastAPI projects do —
and then `model_validate` after commit reads in-memory state without a
round trip.

Required Files Changes :
- backend/app/database.py (optional)
- backend/app/routers/destinations.py

---

### 30. Migration is destructive — `downgrade()` drops users + bikes + everything

**Severity: Minor**

Description :
`backend/alembic/versions/b4e6c8f2a1d3_m1_destination_schema.py` was
landed in M1 but the M2 PR depends on it. Its `downgrade()` drops every
new table including `users`, `bikes`, `destinations`, … with no data
migration back. The migration file docstring acknowledges this ("downgrade
is unused because `./run.sh reset` is the standard recovery path"), but
an inattentive `alembic downgrade -1` in staging permanently wipes user
accounts. M2 doesn't introduce this risk but is the first feature that
relies on the schema in earnest.

Required Fixes :
Replace `downgrade()` with `raise NotImplementedError("M1 migration is
destructive — use ./run.sh reset")` so accidental downgrades crash early.
Add a `safety_marker` table or an Alembic `pre_run` hook that refuses to
downgrade past M1 unless an env var `ALLOW_DESTRUCTIVE_DOWNGRADE=1` is
set. Document in `docs/plan/m2-destination-discovery.md`.

Required Files Changes :
- backend/alembic/versions/b4e6c8f2a1d3_m1_destination_schema.py
- docs/plan/m2-destination-discovery.md

---

## What I missed in the first pass (added in this audit)

The first audit listed 22 findings. This pass expands coverage with:

- **#13** — ILIKE wildcards in `q` are passed through unescaped.
- **#23** — Unnecessary `cast(..., Float)` in the SQL Haversine.
- **#24** — `q=""` empty-string and pure-wildcard search behaviour.
- **#25** — `POST /api/destinations` has no per-user submission cap.
- **#26** — `home_latitude`/`home_longitude` aren't range-validated on user update — the *first* feature to read them is M2, so the regression surfaces here.
- **#27** — `list_ratings` is public-readable with full names/avatars.
- **#28** — `?tags=` empty-string list semantics.
- **#29** — Extra round-trip from `db.refresh` + relationship lazy-load after commit.
- **#30** — Destructive `downgrade()` in the M1 migration that M2 now depends on.

Findings that survive from the first pass: #1–12, #14–22, #4 (#4 = SQL/Python formula mismatch, here #4).

## Triage — what to land before any production traffic

1. **#1, #2, #3** — concurrent rating 500s, anonymous-flow pool drain, JWT hardening. These are *blockers*.
2. **#4, #6, #7, #8, #9, #10, #11, #12** — incorrect data (formula mismatch, missing validation, N+1, duplicated riders, currency mislabel, misleading totals, silent filters). All Majors — land before exposing the M2 surface beyond the demo.
3. **#13, #14, #15, #16** — search escape, CORS, frontend error rendering, types/abort. Required before the M2 UI ships in the next milestone.
4. **#17–30** — code health and minor product gaps. Park in a follow-up.

## Suggested follow-up artefacts

- `backend/tests/conftest.py` — shared fixtures (db session per test, factory for `Destination`, `User`, `Bike`, `RideLog`).
- `backend/tests/test_*` files referenced in each finding.
- `frontend/src/lib/api.types.ts` to type the M2 surface end-to-end.
- `docs/plan/m2-destination-discovery.md` — capture the resolutions of findings 10, 19, 27, 30 (currency policy, ranking math, privacy posture, migration safety).
