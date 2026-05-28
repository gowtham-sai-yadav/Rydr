# M2 Destination-Discovery — Production Engineering Audit

**Scope:** All changes on `feat/implementation1` since `b329170` that introduce
the M2 destinations / tags / cost-estimate surface area.

**Files reviewed (direct + indirectly impacted):**

- `backend/app/routers/destinations.py` (new)
- `backend/app/routers/tags.py` (new)
- `backend/app/services/cost_calculator.py` (new)
- `backend/app/services/geo.py` (new)
- `backend/app/schemas/destination.py` (modified)
- `backend/app/dependencies.py` (modified — `get_optional_user`)
- `backend/app/main.py` (modified — router registration)
- `backend/app/config.py` (modified — `FUEL_PRICE_INR_PER_L`)
- `frontend/src/lib/api.ts` (modified — M2 client methods)
- Indirectly impacted: `backend/app/models/destination.py`,
  `backend/app/models/ride.py`, `backend/app/models/ride_log.py`,
  `backend/app/models/user.py`, `backend/app/schemas/ride.py`,
  `backend/app/routers/auth.py`, `backend/app/routers/users.py`.

The findings below are ordered by severity, then by risk-to-prod blast radius.

---

## 1. Race condition on rating upsert produces 500 errors

**Severity: Critical**

Description :
`POST /api/destinations/{id}/ratings` (`create_or_update_rating`,
`backend/app/routers/destinations.py:421-461`) does a *check-then-insert*: it
queries for an existing `(destination_id, user_id)` row, and if absent runs
`db.add(Rating(...))`. Two concurrent submissions from the same user (double-tap
on mobile, retried request, network hiccup) both pass the check and try to
insert — the second hits the `uq_rating_destination_user` unique constraint,
raising `IntegrityError` and surfacing as an opaque HTTP 500. The same race
also causes `_recompute_rating_aggregates` to over- or under-count if a second
write commits between flush and aggregate read. In production this manifests as
intermittent rating-submission failures and silently-wrong `avg_rating` on the
detail card.

Required Fixes :
Replace the check-then-insert with an atomic upsert: use
`sqlalchemy.dialects.postgresql.insert(Rating).on_conflict_do_update(...)`
keyed on the unique constraint, returning the row, then recompute aggregates in
the **same transaction** with a `SELECT ... FOR UPDATE` lock on the destination
row (or via `pg_advisory_xact_lock(destination_id)`). Wrap the whole handler in
a `try/except IntegrityError` that maps to a 409 Conflict with a clear message
for any other constraint hit. Recompute aggregates with a single SQL statement
(`UPDATE destinations SET avg_rating = (SELECT AVG ...), rating_count = ...
WHERE id = :id`) so the destination row and the rating row mutate atomically.
Regression tests: two concurrent threads issuing POST for the same
(user, destination), retries on flaky network, large `stars` payload, rating
without `ride_log_id`, and verification that `avg_rating` matches `AVG(stars)`
after the burst.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (if a partial unique index / `pg_advisory_xact_lock` helper is added)
- backend/tests/test_ratings_concurrent.py (new)

---

## 2. `DestinationOut` returned after `db.refresh` triggers N+1 + uses lazy-loaded relationships

**Severity: Major**

Description :
`submit_destination` (`backend/app/routers/destinations.py:288-329`) calls
`db.commit()` then `db.refresh(dest)`. `refresh()` reloads the column state but
does **not** eager-load relationships, so the subsequent
`_serialize_detail(db, dest)` walks `destination.tags` and `destination.media`
on a session where `expire_on_commit=True` is the default — each iteration
emits its own SELECT. For a destination submitted with 8 tags + 12 gallery
URLs, that is ~21 round trips per POST. Worse, the same lazy-loading happens
on `_serialize_detail` from `get_destination` even though
`_load_destination_or_404` *does* eager-load tags+media — but the second
nested `dt.tag` access also walks lazily on each `DestinationTag` row unless
the chained `selectinload(DestinationTag.tag)` is preserved (it is on detail
but not on the POST path).

Required Fixes :
After `db.commit()` in `submit_destination`, replace `db.refresh(dest)` with a
re-fetch via `_load_destination_or_404(db, dest.id)` so the same eager-loading
chain (`selectinload(Destination.tags).selectinload(DestinationTag.tag),
selectinload(Destination.media)`) is applied. Confirm `_recent_riders` is
still invoked. Alternatively, attach `selectin`/`joined` loaders to the
relationship definitions in `models/destination.py` for hot paths
(`Destination.tags`, `DestinationTag.tag`, `Destination.media`). Add a SQL log
assertion in tests (`sqlalchemy.engine` debug) verifying ≤ 4 queries per
detail/POST response. Edge cases: a destination with zero tags, zero media,
mixed (tags-only / media-only), and very-large media arrays.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (optional eager-load hints)
- backend/tests/test_destination_query_count.py (new)

---

## 3. Recent-rider preview list duplicates the same user

**Severity: Major**

Description :
`_recent_riders` (`backend/app/routers/destinations.py:98-133`) computes
`count` with `func.count(distinct(RideLog.rider_id))`, but the `preview_rows`
query selects `User` JOIN-ed against `RideLog` *without* `DISTINCT` and
ordered by `RideLog.actual_end_ts.desc()`. A power-user who completed two
trips to the same destination in the last 90 days is returned twice in the
3-item preview, so the avatar strip on the destination card can read
"Alice · Alice · Bob" while the badge reads "12 riders". This contradicts the
schema comment ("distinct riders") and makes the UX look broken on popular
destinations.

Required Fixes :
Wrap the preview query in a subquery that picks the latest `actual_end_ts` per
`rider_id` (`row_number() OVER (PARTITION BY rider_id ORDER BY
actual_end_ts DESC) = 1`) before joining `User`, or switch to a
`SELECT DISTINCT ON (rider_id) ...` (Postgres) ordered by `(rider_id,
actual_end_ts DESC)` and then re-order by `actual_end_ts` in an outer query
limited to `RECENT_RIDER_PREVIEW`. Collapse the two queries into one CTE so we
don't pay two round trips per detail call. Cover the cases: same rider, 5
RideLogs in window → returns once; multiple riders, mixed window membership;
RideLogs without `actual_end_ts` (must be excluded — already guarded).

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_detail_recent_riders.py (new)

---

## 4. Pagination is non-deterministic across pages (missing tiebreaker)

**Severity: Major**

Description :
`list_destinations` orders by `avg_rating.desc(), rating_count.desc()` (or
`rating_count, avg_rating` / `distance`) — none of these are unique, and there
is no secondary key on `Destination.id`. Postgres is free to return tied rows
in any physical order, so the same destination can appear on both page 1 and
page 2 (or disappear from both) on a busy table — the classic offset-pagination
duplicate/skip bug. The same defect exists on `list_destination_media` and
`list_ratings` (ordered only by `created_at.desc()`; two ratings with identical
`created_at` to second precision is realistic at seed time).

Required Fixes :
Append `Destination.id.asc()` as the last clause of every `order_by` call in
the three list endpoints. Document the convention as "every paginated list
ends in a stable id tiebreaker." Long-term, prefer keyset pagination
(`WHERE (rating, id) < (:last_rating, :last_id)`) over offset for hot lists
— offset gets expensive past page ~50 and is what most production feeds avoid.
Regression tests: seed N destinations with identical `avg_rating`, page through
with `limit=2`, assert union equals full set with no duplicates; same for
ratings created in the same second.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_list_pagination.py (new)

---

## 5. Tag filter semantics are ambiguous + silently drops unknown slugs

**Severity: Major**

Description :
The `tags` filter (`backend/app/routers/destinations.py:214-224`) uses
`Tag.slug.in_(tags)` inside an `EXISTS`, which translates to "destination has
*at least one* tag matching any provided slug" (OR). The frontend / docs do not
declare whether multi-tag is OR or AND; if a user picks `coastal` + `scenic`
expecting "must be both," the result set is wider than expected. Worse, an
unknown slug (typo, deprecated tag) is silently dropped — the filter returns
the unfiltered set with no warning, which can spike the result set to "all
destinations" for a buggy frontend.

Required Fixes :
Decide and document AND vs OR semantics (recommend AND for both `tags` and
`vehicle_fit` — that matches the chip-style filter UX where each chip narrows).
For AND, replace the single `EXISTS` with one `EXISTS` per slug, joined via
`and_(...)`. Validate all incoming slugs against `Tag.slug` up-front and 400
on any unknown slug so frontend bugs surface loudly. Cap the number of accepted
slugs (e.g., 20) to keep query plans cheap. Mirror the same change in
`vehicle_fit`. Test cases: two known slugs returns intersection; one known + one
unknown returns 400; over-limit returns 422; empty list behaves like "no
filter."

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/schemas/destination.py (optional `tag_slugs` validator)
- docs/plan/m2-destination-discovery.md
- backend/tests/test_destination_filters.py (new)

---

## 6. `DestinationCreate` accepts unbounded/invalid lat-lng, gallery, review payloads

**Severity: Major**

Description :
`backend/app/schemas/destination.py` declares `latitude: float` /
`longitude: float` on `DestinationCreate` with **no range validation** —
authenticated users can submit `latitude=12345.6` and it lands in the DB. The
list endpoint applies `ge=-90/le=90` only to the *query* param `from_lat`. The
same schema has `gallery_urls: List[str] = []` with no length cap and no URL
validation — a single POST can insert thousands of `DestinationMedia` rows,
each url constrained only at the DB layer (`String(500)`); a 501-char URL
crashes the request with `IntegrityError`/500. `RatingCreate.review` is
`Optional[str]` with no `max_length`, but the DB column is `Text`, so a 10 MB
review is accepted and bloats the table.

Required Fixes :
Add `Field(ge=-90, le=90)` / `Field(ge=-180, le=180)` on
`DestinationCreate.latitude/longitude`. Validate each entry in `gallery_urls`
with `HttpUrl` (pydantic) and cap the list at, say, 20 entries via a
`field_validator` or `conlist`. Cap `tag_slugs` length similarly. Add
`max_length=2000` to `RatingCreate.review` so DB never sees more than the UI
can render. Mirror the validation on `currency` (already 3 chars) by also
constraining the alphabet (`pattern="^[A-Z]{3}$"`). Test: out-of-range coords
return 422; 21-URL gallery returns 422; oversize review returns 422;
mixed-case currency canonicalised or rejected.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/tests/test_destination_validation.py (new)

---

## 7. `cost-estimate` is INR-named but applies to non-INR destinations

**Severity: Major**

Description :
`CostEstimate` (`backend/app/schemas/destination.py:158-166`) hardcodes field
names `fuel_inr`, `food_inr`, `entry_inr`, `total_inr_low/high` while
`cost_calculator.estimate_cost` simply copies `destination.currency` into the
`currency` field. For a destination saved with `currency="USD"`, the response is
`{"fuel_inr": 1200, ..., "currency": "USD"}` — the value is in destination
currency but the key claims INR. The fuel price multiplier
(`FUEL_PRICE_INR_PER_L`) is also applied unconditionally, producing nonsense
totals for any non-INR destination. Phase-3 spec might list this as
single-currency-for-now, but the data model already permits other currencies,
so this is a latent landmine for the moment we seed an out-of-country
destination.

Required Fixes :
Either (a) enforce `currency == "INR"` at the model / submit endpoint until
multi-currency support lands, returning 400 on submission with another
currency; or (b) rename the response fields to `fuel`, `food`, `entry`,
`total_low`, `total_high` and add an `assumptions.fuel_price` keyed by
currency. The frontend `getCostEstimate` would adapt naturally — type the
response in `api.ts` to reflect the new shape. Add a unit test that a USD
destination either 400s the submission or returns a sane response with the
correct currency key, and that `FUEL_PRICE_INR_PER_L` is not applied to
non-INR destinations.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/services/cost_calculator.py
- backend/app/routers/destinations.py
- frontend/src/lib/api.ts
- backend/tests/test_cost_estimate.py (new)

---

## 8. Two different distance formulas in SQL vs Python — boundary destinations flip

**Severity: Major**

Description :
`_haversine_sql` in `routers/destinations.py:70-82` is actually the
**spherical-law-of-cosines** formula (`R*acos(sin(lat1)sin(lat2) +
cos(lat1)cos(lat2)cos(dlng))`), while `geo.haversine_km` is the genuine
Haversine. These return slightly different values (centimetres to metres
typically, but up to ~0.5% near antipodes). The list endpoint filters/sorts
with the SQL version but re-computes `distance_km` per row in Python with
Haversine before returning. A destination on the `radius_km=100.0` boundary
can be included by SQL (`acos`-based: 99.97 km) yet rendered as
`"distance_km": 100.05` on the card — a confusing UX bug for power users who
zoom in on the edge. The 6371.0088 km radius is also duplicated in two places,
inviting drift.

Required Fixes :
Pick one formula and use it everywhere. Recommendation: rewrite
`_haversine_sql` to compute the Haversine form
(`2*R*asin(sqrt(sin(dphi/2)^2 + cos(phi1)cos(phi2)sin(dlam/2)^2))`), drop the
clamp (Haversine doesn't need it because `a ∈ [0,1]`), and import
`EARTH_RADIUS_KM` from `services.geo` to remove the duplicate. Add a unit test
that the SQL and Python distances agree to within 1 cm for a representative
grid of points, and that boundary radius matches in both directions. Defer to
PostGIS in M11 as planned.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/services/geo.py
- backend/tests/test_distance_parity.py (new)

---

## 9. `get_optional_user` opens an extra DB connection on every public GET

**Severity: Major**

Description :
`Depends(get_optional_user)` (`backend/app/dependencies.py:43-64`) is hardwired
to `Depends(get_db)`, so **every** anonymous `GET /api/destinations` and
`GET /api/destinations/{id}` opens a session, decodes a JWT it never has, and
closes it. Worse, it still pulls a session even when no `Authorization` header
is sent (the `if credentials is None: return None` happens *after* the
`get_db` dependency resolves, so the connection has already been checked
out). On a homepage load with 1 list call + 5 detail calls, that is 6 extra
sessions per anonymous visitor. Under load (a HN-style burst) this drains the
SQLAlchemy pool and starves authenticated requests.

Required Fixes :
Make the DB session lazy in the optional dependency: pull `db` only when
`credentials is not None`. Two ways: (a) move the `get_db` resolution inside
the function body by injecting `Request` and constructing a `SessionLocal()`
locally with `try/finally`; or (b) keep `get_db` injected but skip the user
lookup so the pool overhead is just session-check-out (the cleaner option is
(a)). Sanity-check `pool_size` and `max_overflow` in `database.py` against
expected anonymous traffic. Load test: 50 RPS anonymous, verify session pool
high-water mark < pool_size + max_overflow.

Required Files Changes :
- backend/app/dependencies.py
- backend/app/database.py (verify pool config)
- backend/tests/test_optional_auth.py (new)

---

## 10. JWT decode in `get_optional_user` doesn't verify expiry / audience explicitly

**Severity: Major**

Description :
`jwt.decode(..., algorithms=[settings.ALGORITHM])` in
`backend/app/dependencies.py:55-57` relies on python-jose defaults. python-jose
does verify `exp` by default, but it does **not** verify `aud` / `iss` unless
explicitly told to, and there's no `options={"require": ["exp"]}` — a token
minted without `exp` is accepted indefinitely. Combined with `SECRET_KEY`
default `"super-secret-key-change-in-production"` (`config.py:6`), an attacker
who guesses the dev secret can mint tokens for any user. The same defect is in
`get_current_user`, but the M2 changes widen the blast radius by exposing the
optional flow on public endpoints.

Required Fixes :
Pass `options={"require": ["exp", "sub"], "verify_exp": True}` to both
`jwt.decode` calls; add issuer/audience claims on mint (`create_access_token`
in `services/auth_service.py`) and verify them on decode. Refuse startup if
`SECRET_KEY` is the default in any non-dev environment — read an `ENV` /
`APP_ENV` setting in `config.py` and raise on mismatch. Treat
`get_optional_user` exactly like `get_current_user` — a *valid* token that has
expired should not silently downgrade to anonymous; that's a user-facing
"you're logged out" event and should not happen silently because the
personalization will silently disappear. Decide whether expired tokens on
optional endpoints should 401 or just log a warning. Tests: expired token,
tampered token, none-alg attack rejection, missing `exp` rejection.

Required Files Changes :
- backend/app/dependencies.py
- backend/app/services/auth_service.py
- backend/app/config.py
- backend/tests/test_jwt_hardening.py (new)

---

## 11. `submit_destination` flushes the row before validating tags — visible inside the transaction

**Severity: Major**

Description :
`backend/app/routers/destinations.py:294-323` does `db.add(dest); db.flush()`
**before** running the tag-slug existence check that raises 400. The flush
issues `INSERT INTO destinations`, allocating a UUID and burning a sequence
slot inside Postgres' current transaction. While the eventual rollback at
session close clears the row, intermediate triggers / partial indexes (none
today, but likely in M9+) see the row mid-flight. There is also no transaction
boundary explicitly opened — SQLAlchemy 2.0 implicit transactions mean the
flush+rollback path is correct *today*, but the lack of an explicit
`with db.begin():` block makes future regressions hard to reason about.

Required Fixes :
Reorder: resolve and validate `payload.tag_slugs` against the DB **before**
constructing the `Destination` row. Optionally wrap the whole handler in
`with db.begin():` for clarity and to guarantee rollback. Move the
`gallery_urls` length / URL validation into the schema (see finding 6) so it
runs server-side before any DB writes. Also raise 400 (or 422) when
`tag_slugs` contains duplicates — currently a duplicate slug inserts duplicate
`DestinationTag` rows that violate the composite PK and surface as 500. Tests:
unknown slug returns 400 with no row inserted; duplicate slug returns 422;
mid-flush failure rolls back cleanly.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_submit.py (new)

---

## 12. Cost-estimate `total_low/high` clamps fuel to zero silently

**Severity: Major**

Description :
`cost_calculator.estimate_cost:46` computes `total_mid = (fuel_inr or 0) +
food + entry`. When the user has no bike record (or no `mileage_kmpl`), fuel
is reported as `None` and excluded — but the totals still apply the ±20%
buffer to *just* food+entry, which is then labelled `total_inr_low/high`.
The user sees "estimated ₹240–₹360" for a 400 km trip because their bike
profile is missing — wildly misleading. The `assumptions.fuel_excluded_reason`
note is buried in a dict the UI may not surface. This causes downstream UX
distrust: users plan trips based on a number that's off by an order of
magnitude.

Required Fixes :
When `fuel_inr is None`, set `total_inr_low` and `total_inr_high` to `None`
as well (Pydantic optional), and add a top-level boolean
`fuel_included: bool` to the schema so the UI can render an explicit "add
your bike to get a fuel estimate" CTA. Alternatively, fall back to a default
mileage (e.g. 35 kmpl) and surface it loudly in `assumptions`. Decide the
product call, but do not silently produce a misleading total. Tests: user with
no bike → totals are None + flag set; user with bike but mileage=0 → same
path; user with bike+mileage → totals computed; explicit `bike_mileage_kmpl`
query override beats user record.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/services/cost_calculator.py
- frontend/src/lib/api.ts (type the response)
- backend/tests/test_cost_estimate_missing_bike.py (new)

---

## 13. Frontend `request<T>` mis-renders FastAPI validation error arrays

**Severity: Minor**

Description :
`frontend/src/lib/api.ts:18-25` does `throw new Error(body.detail || ...)`.
FastAPI's 422 validation responses return `detail` as an **array** of
`{loc, msg, type}` objects. `new Error(array)` coerces the array to
`"[object Object],[object Object]"`, so the UI will show that string verbatim
when a user submits an invalid destination. Every M2 form (submit destination,
submit rating, cost-estimate) is now subject to this regression.

Required Fixes :
Normalize the error body: if `detail` is an array, map to
`detail.map(d => `${d.loc?.join('.')}: ${d.msg}`).join('; ')`; if it's a
string, use as-is; else fall back to `Request failed: ${status}`. Optionally
return a structured `ApiError` class with `status`, `code`, `fields` so forms
can highlight per-field problems. Tests: hit the API with a known-bad payload
and assert the rendered error string is human-readable.

Required Files Changes :
- frontend/src/lib/api.ts
- frontend/src/__tests__/api.error-shape.test.ts (new)

---

## 14. Frontend client lacks types for new responses + no abort/timeout

**Severity: Minor**

Description :
Every new M2 method in `frontend/src/lib/api.ts:138-217` returns
`Promise<unknown>`, pushing type assertions onto every caller. Combined with
the existing `request` having no `AbortController` plumbing and no timeout,
slow backend responses (cost-estimate hits a slow Postgres without PostGIS)
will hang React components until the user navigates away — and any
state-set-after-unmount triggers React warnings. There is also no in-flight
de-duplication (a user mashing the filter chips will queue 5 list calls and
display whichever finishes last, not most-recent-requested), a classic
"race-y filter list" bug.

Required Fixes :
Declare TS interfaces matching the Pydantic schemas (`DestinationListResponse`,
`DestinationOut`, `CostEstimate`, `TagListResponse`, `RatingListResponse`,
`DestinationMediaListResponse`) and have each method return the typed promise.
Plumb an `AbortSignal` through `request` and accept one in every list call so
the UI can cancel on unmount or on the next keystroke. Consider react-query /
SWR for de-duplication and stale-while-revalidate. Test: rapid filter changes
only render the most recent result; component unmount during a fetch cancels.

Required Files Changes :
- frontend/src/lib/api.ts
- frontend/src/lib/api.types.ts (new)
- frontend/src/__tests__/api.cancel.test.ts (new)

---

## 15. CORS allows only `localhost:3000` — production URL will silently 404 the frontend

**Severity: Minor**

Description :
`backend/app/main.py:8-14` is unchanged but now sits in front of public
endpoints (`GET /api/destinations`, `/api/tags`) that the SEO/SSR layer might
hit from a server other than `localhost:3000`. Hardcoding `allow_origins`
makes any non-local deploy fail at the browser. Not introduced by this PR but
the new public surface area amplifies the risk.

Required Fixes :
Pull `ALLOWED_ORIGINS` from settings (`config.py`) as a comma-separated env
var with a sane local default. Also fix the deprecated
`class Config: env_file = ".env"` pattern in pydantic-settings 2.x — use
`model_config = SettingsConfigDict(env_file=".env")` to silence the deprecation
warning that's currently logged on every startup. Add a smoke test that
unknown origins are blocked and listed origins are allowed.

Required Files Changes :
- backend/app/main.py
- backend/app/config.py

---

## 16. No length cap on `q` search term + ILIKE without index

**Severity: Minor**

Description :
`list_destinations` accepts `q` up to 200 chars and runs
`Destination.name.ilike(f"%{q}%") OR Destination.region.ilike(f"%{q}%")`.
Neither column has a `pg_trgm` GIN index, so this is a full-table sequential
scan on every search. At 10k destinations this is sub-second; at 1M it's
seconds. The 200-char limit makes it easy to construct adversarial inputs
(`%%%%%%%...%`) that defeat the planner's selectivity estimates.

Required Fixes :
Add a Postgres trigram index in an Alembic migration:
`CREATE INDEX idx_destinations_name_trgm ON destinations USING gin (name
gin_trgm_ops);` plus the same for `region`. Enable the `pg_trgm` extension in
the migration. Use `func.lower(Destination.name).like(...)` with the leading
wildcard removed where the UX permits (`q%`), or fall back to a `tsvector`
search for full-text. Also strip leading/trailing whitespace on `q` and
reject query strings that are pure wildcards. Test: search for empty / short
/ long terms; bench plan with `EXPLAIN ANALYZE`.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/alembic/versions/{new}_destinations_trgm.py (new)

---

## 17. `_serialize_detail` builds `DestinationOut` manually — easy drift with schema

**Severity: Minor**

Description :
`backend/app/routers/destinations.py:147-178` enumerates 20+ fields by hand.
The next time a column is added to `Destination` (e.g., `m9` adds
`avg_recommend_pct`), the new field will be silently dropped from the response
unless someone remembers to update this function. This is the kind of debt that
explodes at the M9/M10 merge.

Required Fixes :
Build the body with `DestinationOut.model_validate(destination,
from_attributes=True)` and then attach the two computed fields
(`recent_rider_count`, `recent_riders`) via `model_copy(update={...})`. Make
sure the relationships are eager-loaded first (see finding 2). Add a test that
new model columns surface in the response without code changes.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/tests/test_destination_serializer.py (new)

---

## 18. `RatingOut.user` lazy-loads on every list item — N+1 on `list_ratings`

**Severity: Minor**

Description :
`list_ratings` (`backend/app/routers/destinations.py:394-418`) does call
`.options(selectinload(Rating.user))` — good — but `create_or_update_rating`
finishes with `RatingOut.model_validate(rating)` after `db.refresh(rating)`,
and refresh does not load `user`. The model_validate walk triggers a SELECT
for the user. Tiny but happens on every rating submit.

Required Fixes :
After `db.refresh(rating)`, eagerly load `rating.user` (e.g. by re-fetching
with `db.query(Rating).options(selectinload(Rating.user)).get(rating.id)`).
Or set `lazy="joined"` on `Rating.user` since it's almost always read with
the rating in this app. Test: a single POST emits ≤ 3 SQL statements.

Required Files Changes :
- backend/app/routers/destinations.py (or)
- backend/app/models/destination.py

---

## 19. `popularity` sort is just `rating_count` — discoverability is biased to seeded data forever

**Severity: Minor**

Description :
`sort=popularity` orders by `(rating_count desc, avg_rating desc)`. Newly
listed destinations start at `rating_count=0` and are pushed to the bottom of
the list for life. The current PR ships the discovery surface — without a
"recency boost" or a "trending" signal (e.g., `rating_count_30d`), the homepage
will stagnate as soon as the first few destinations accumulate any ratings.

Required Fixes :
Compute a `trending` score in SQL using `COUNT(rating) FILTER (WHERE
created_at > now() - interval '14 days')` or denormalize a
`recent_rating_count` column updated on rating insert (the recompute step
already runs). Add this as a separate sort option (`sort=trending`) rather
than redefining popularity. Document the ranking math in
`docs/plan/m2-destination-discovery.md`. Tests: a fresh destination with a
single recent rating ranks higher than a stale one with five old ratings.

Required Files Changes :
- backend/app/routers/destinations.py
- backend/app/models/destination.py (optional column)
- docs/plan/m2-destination-discovery.md

---

## 20. Duplicate `EARTH_RADIUS_KM`, duplicate haversine intent

**Severity: Minor**

Description :
`EARTH_RADIUS_KM` is defined in both `backend/app/services/geo.py:11` and
`backend/app/routers/destinations.py:62`. Drift is inevitable. Same for the
"distance from origin" logic (in-Python in geo.py, in-SQL in the router).

Required Fixes :
Move `EARTH_RADIUS_KM` to `services/geo.py` only; import it in the router.
Move the SQL haversine expression into `services/geo.py` as a free function
`haversine_sql_expression(origin_lat, origin_lng) -> ColumnElement[float]`
so the formula change in finding 8 only happens in one place.

Required Files Changes :
- backend/app/services/geo.py
- backend/app/routers/destinations.py

---

## 21. `tags` router returns flat group with no totals — but consumers will paginate

**Severity: Minor**

Description :
`GET /api/tags` returns `{vibe: [...], vehicle_fit: [...]}` with no totals or
pagination. Fine for the current ~20 tags, but the frontend has no way to
distinguish "empty list because there are no tags" from "empty list because
of an error" beyond HTTP status. Also, the router fetches all rows with no
limit — a future tag spam attack (no auth on `POST /tags` because there is
none, but admin tools will eventually mass-create) could blow up the
response.

Required Fixes :
Add a `total` field on `TagListResponse`. Add a soft cap (`limit 200`) on the
query as a safety net. If tag list grows past ~50, switch the filter UI to a
typeahead and gate the endpoint with `?q=` server-side search. Tests: empty
tag table returns empty lists with total=0; large tag table is capped.

Required Files Changes :
- backend/app/schemas/destination.py
- backend/app/routers/tags.py

---

## 22. `from app.schemas.ride import UserBrief` creates a hidden import coupling

**Severity: Minor**

Description :
`backend/app/schemas/destination.py:15` and
`backend/app/routers/destinations.py:55` now both import `UserBrief` from
`schemas/ride`. The destination domain shouldn't depend on the ride domain
for a generic user-summary DTO. As M3 reshapes `schemas/ride`, every
destination-side import breaks. The same coupling will appear in chat,
social, etc.

Required Fixes :
Move `UserBrief` to `schemas/user.py` (where the user domain lives) and
re-export from `schemas/ride.py` for backwards compatibility, then update the
new destination imports to point at `schemas/user`. Alternatively put it in
`schemas/_shared.py`. Run grep to find every existing import and update them
in one pass.

Required Files Changes :
- backend/app/schemas/user.py
- backend/app/schemas/ride.py
- backend/app/schemas/destination.py
- backend/app/routers/destinations.py

---

## Summary

| # | Severity | Area |
|---|----------|------|
| 1 | Critical | Rating upsert race → 500 / wrong averages |
| 2 | Major    | N+1 lazy-load on POST `/destinations` |
| 3 | Major    | Recent-rider preview duplicates users |
| 4 | Major    | Pagination missing tiebreaker |
| 5 | Major    | Tag filter semantics + silent unknown slugs |
| 6 | Major    | Submit payload validation gaps (lat/lng, gallery, review) |
| 7 | Major    | INR-named cost fields for non-INR destinations |
| 8 | Major    | SQL vs Python distance formulas disagree |
| 9 | Major    | Optional auth checks out DB session for every anonymous GET |
| 10 | Major   | JWT decode trusts default secret + lax claim checks |
| 11 | Major   | Submit flushes destination row before tag validation |
| 12 | Major   | Cost estimate silently zero-fuels and lies about totals |
| 13 | Minor   | Frontend renders validation errors as `[object Object]` |
| 14 | Minor   | Frontend lacks types, abort, dedupe |
| 15 | Minor   | CORS hardcoded to localhost:3000 |
| 16 | Minor   | ILIKE `q` search lacks trigram index |
| 17 | Minor   | Manual `DestinationOut` build → drift risk |
| 18 | Minor   | `RatingOut.user` lazy-load N+1 on submit |
| 19 | Minor   | `popularity` sort is permanent / no trending |
| 20 | Minor   | Duplicated `EARTH_RADIUS_KM` constants |
| 21 | Minor   | `/api/tags` has no cap / totals |
| 22 | Minor   | Hidden `schemas/ride → schemas/destination` import coupling |

The top three to fix before any production traffic: **#1 (concurrency), #9 (pool exhaustion), #10 (JWT hardening)**. Everything else is fix-before-public-beta.
