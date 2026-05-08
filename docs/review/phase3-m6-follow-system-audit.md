# Phase 3 / M6 — Follow System — Production Engineering Audit

**Branch:** `feat/implementation1`
**Base commit:** `0c16fdc` (post-M5)
**Audit date:** 2026-05-24
**Reviewer:** Production audit pass for the M6 follow-system PR

This is the production-readiness audit for the M6 PR that adds the follow
edge (`POST/DELETE /api/users/{id}/follow`), follower/following list
endpoints, a `following_only` filter on the ride feed, and follow-derived
counts on every `UserOut`. Each finding includes a **"Fix required?"**
verdict.

## Files in scope

**Modified by the PR:**

| File | Change |
|---|---|
| `backend/app/models/social.py` | Adds two compound indexes on `follows` |
| `backend/app/routers/rides.py` | Adds `following_only` filter on the ride feed |
| `backend/app/routers/users.py` | +300 lines: `_load_user_with_social`, follow/unfollow, paginated follower/following lists |
| `backend/app/schemas/social.py` | `FollowEdgeOut`, `FollowListResponse` |
| `backend/app/schemas/user.py` | `UserOut.followers_count`, `following_count`, `is_followed_by_me` |
| `frontend/src/lib/api.ts` | 4 new follow methods + `following_only` query param |

**New files:**

| File | Purpose |
|---|---|
| `backend/alembic/versions/a7b2c9d4e1f5_m6_follow_indexes.py` | Alembic migration for the two new indexes |
| `docs/plan/m6-follow-system.md` | M6 plan |

**Indirectly impacted (read for context):**
`backend/app/routers/auth.py` (returns `UserOut` at signup/login),
`backend/app/models/user.py` (existing relationships),
`backend/app/dependencies.py` (`get_optional_user` reused on user detail),
`backend/app/services/auth_service.py` (does not flow new fields).

## Prior-audit deltas verified before re-flagging

- M5 audit #2 (204 / `request<T>` JSON-parse error) → resolved via `request<void>` overload; `unfollowUser` correctly uses it.
- M2 audit #5 (pagination tiebreaker) → `_paginated_follow_list` uses `Follow.created_at.desc(), order_tiebreak_field.asc()` where the tiebreak is the *other* FK column (part of the composite PK) — deterministic.
- M2 audit #18 (concurrent ratings race) → pattern correctly reused via `pg_insert(...).on_conflict_do_nothing(...)` in `follow_user`.

## Findings — ordered by severity, then by blast radius

---

### 1. Model `Index` declares ASC `created_at` but the migration creates DESC indexes

**Severity: Major**
**Fix required?** YES — Alembic autogenerate will fight you forever otherwise.

Description :
`backend/app/models/social.py:45-56` declares the two new indexes with
`Index("idx_follows_followed_created", "followed_id", "created_at", ...)` —
SQLAlchemy defaults to ASC on the unquoted column. The migration in
`backend/alembic/versions/a7b2c9d4e1f5_m6_follow_indexes.py:34-43` builds
them as `["followed_id", sa.text("created_at DESC")]`. Postgres can scan
either direction so the *query* still works, but the model and the
DB are now out of sync: any future `alembic revision --autogenerate` will
emit a DROP + CREATE pair to reconcile, and a fresh `Base.metadata.create_all`
(used in some test setups) will produce a structurally different schema
than `alembic upgrade head`. Two developers running these two flows get
two different DBs.

Required Fixes :
Decide on one direction (DESC is correct given the
`order_by(Follow.created_at.desc(), ...)` in `_paginated_follow_list`) and
make both sides match. Easiest: change the model to
`Index("idx_follows_followed_created", Follow.followed_id,
Follow.created_at.desc())` using the SA expression API so the DESC is
encoded. Verify by running `alembic revision --autogenerate -m noop` and
asserting it produces an empty migration. Same for the follower-indexed
twin. Tests: a CI check that `alembic --autogenerate` against the model
produces no diffs.

Required Files Changes :
- backend/app/models/social.py
- backend/tests/test_alembic_autogenerate_clean.py (new)

---

### 2. Auth flow returns stale follow counts at signup / login

**Severity: Major**
**Fix required?** YES — every authenticated session starts with wrong data.

Description :
`backend/app/routers/auth.py:15` does
`UserOut.model_validate(user).model_dump(mode="json")` for both
`POST /api/auth/signup` and `POST /api/auth/login`. The User instance
hydrated by `authenticate_user` / `create_user` has no
`followers_count`, `following_count`, or `is_followed_by_me` attributes
attached, so Pydantic falls back to the schema defaults — `0, 0, False`.
A returning user with 200 followers sees "0 followers" on their first
post-login render until they hit `/me`. Worse, any frontend that caches
the auth payload as the source-of-truth user object never recovers until
manual reload.

Required Fixes :
Route the auth response through the same `_load_user_with_social` helper
that `/me` and `/{id}` use. Extract the helper from `routers/users.py`
into a small service module (`services/user_view.py`) so the auth router
can import it without cross-router coupling. Pass `viewer=user` so
`is_followed_by_me` is False (by design — the EXISTS subquery hits the
`ck_follow_not_self` constraint and returns no rows). Tests:
seed a user with N followers, signup new account → `followers_count=0`;
login existing user → `followers_count=N`.

Required Files Changes :
- backend/app/routers/auth.py
- backend/app/services/user_view.py (new — extracted helper)
- backend/app/routers/users.py (import the extracted helper)
- backend/tests/test_auth_returns_follow_counts.py (new)

---

### 3. `db.query(User, scalar1, scalar2, scalar3).options(joinedload(User.bike))` is the wrong shape

**Severity: Major**
**Fix required?** YES — this either fails at runtime, silently ignores the joinedload, or returns duplicate rows when the bike has any to-many.

Description :
`_load_user_with_social` (`backend/app/routers/users.py:93-103`) builds a
multi-entity `db.query(User, scalar_subquery, scalar_subquery, exists)` and
attaches `.options(joinedload(User.bike))`. SQLAlchemy 2.0 treats
`joinedload` as a loader option on the *primary* entity — but when the
query has additional scalar columns, the join LEFT-OUTER-JOINs `bikes`
into the SELECT. The User row may then be duplicated across `bikes` rows
(here `bikes` is 1:1 so duplication is bounded, but the `.first()` call
silently discards any second row — fine today, fragile if `bike`'s
multiplicity ever changes). The bigger risk: SQLAlchemy emits a warning
("Loader options applied to an entity in a `Query()` that also includes
non-entity columns may be ignored") in some versions; the joinedload then
silently degrades to a lazy load, and accessing `user.bike` from inside
Pydantic later fires a separate SELECT — undoing the
"one-round-trip" promise the docstring makes.

Required Fixes :
Restructure as two queries or use a CTE. Cleanest:
(a) Run a single SELECT that fetches just User + the three scalar
expressions, then (b) do a second `selectinload`-style fetch for `bike`.
Or use `query(User).options(joinedload(User.bike))` and then a *separate*
SELECT for the three counts (still one extra round trip, but the
joinedload semantics are guaranteed). Or use a SQLAlchemy 2.0
`select(User, scalar1, ...).options(selectinload(User.bike))` — selectinload
is the safe loader when entities and bare columns mix. Verify with
`echo=True` that exactly one SELECT statement runs for the user fetch
and that `user.bike` access does not fire a subsequent SELECT. Tests:
N+1 assertion (≤ 2 SELECTs per `/api/users/{id}` call).

Required Files Changes :
- backend/app/routers/users.py
- backend/tests/test_user_query_count.py (new)

---

### 4. `following_only` ride-feed filter lacks a supporting index on `ride_plans.captain_id`

**Severity: Major**
**Fix required?** YES once data grows — today this is sub-second on the seed set.

Description :
`backend/app/routers/rides.py:260-272` adds
`RidePlan.captain_id.in_(SELECT followed_id FROM follows WHERE follower_id = :u)`.
No index exists on `ride_plans.captain_id` (verified — none of the M1/M3/M4
migrations create one; Postgres does not auto-index FK columns). For a
user following 200 captains, the planner has to scan the whole
`ride_plans` table once per query, then probe the in-set. With ~10k
rides the cost is small, but the feed is the most-polled endpoint and
this query also stacks with the `RidePlan.status = planned` and
`planned_date >= today` filters that already exist. The compound effect
under load is the single hottest query in the system.

Required Fixes :
Add an index in a new Alembic migration:
`CREATE INDEX idx_ride_plans_captain_planned_date ON ride_plans
(captain_id, planned_date)` — covers the existing
`captain_id == :user_id` path in `/api/rides/mine` and the new
`following_only` path in `/feed`, plus the `planned_date >= today`
ordering can be served from the index. Run `EXPLAIN ANALYZE` on the
feed query before/after; verify Index Scan path. Mirror in the model
via `__table_args__`. Tests: query plan assertion in a perf test.

Required Files Changes :
- backend/app/models/ride.py
- backend/alembic/versions/{new}_ride_plans_captain_index.py (new)
- backend/tests/test_ride_feed_query_plan.py (new)

---

### 5. `home_latitude` / `home_longitude` still unvalidated on `PUT /me`

**Severity: Major**
**Fix required?** YES — M6 is the SECOND milestone to ship code that reads these without ever fixing the writer.

Description :
This was M2 audit finding #26 and is still unaddressed. `UserUpdate`
(`backend/app/schemas/user.py`) accepts `home_latitude: Optional[float]` /
`home_longitude: Optional[float]` with no `Field(ge=-90, le=90)` /
`Field(ge=-180, le=180)`. M2's cost-estimate and now M6's `_resolve_origin`
flows both depend on these values being sane. A user PUT-ing
`home_latitude=200` poisons their cost estimates and the SQL haversine
filter, and now also poisons any future "rides near my followed friends"
feature. The finding survived two milestones without action — explicitly
calling out so M7 doesn't ship a third feature reading these untrusted
values.

Required Fixes :
Per the M2 audit fix: add
`home_latitude: Optional[float] = Field(default=None, ge=-90, le=90)`,
`home_longitude: Optional[float] = Field(default=None, ge=-180, le=180)`
on `UserUpdate` and `SignupRequest`. Add a `model_validator(mode="after")`
that requires both-or-neither. Mirror in any seed data. Tests: PUT
`home_latitude=200` → 422; PUT lat without lng → 422; valid pair updates.

Required Files Changes :
- backend/app/schemas/user.py
- backend/app/schemas/auth.py
- backend/tests/test_user_update_home.py (new)

---

### 6. Alembic migration creates indexes without `CONCURRENTLY` — will lock writes in prod

**Severity: Major**
**Fix required?** YES on the *next* deploy if `follows` has any data; not for the M6 ship since the table is empty today.

Description :
`backend/alembic/versions/a7b2c9d4e1f5_m6_follow_indexes.py:34-43` calls
`op.create_index(...)` without `postgresql_concurrently=True`. The migration
docstring notes "follows is empty in seed data, so backfill cost is zero" —
true today, but the index will be re-applied on every fresh environment
build and on every staging/prod env that has accumulated follows by the
time this lands. A non-concurrent `CREATE INDEX` takes an `AccessShareLock`
that blocks inserts and updates on `follows` for the duration. A million-row
table can lock for tens of seconds; during a deploy with chat / ride
endpoints actively writing, every dependent transaction stalls.

Required Fixes :
Switch to
`op.create_index(..., postgresql_concurrently=True, if_not_exists=True)`
and mark the migration as non-transactional by setting
`op.execute("SET LOCAL statement_timeout = 0")` and using
`with op.get_context().autocommit_block():`. Alembic doesn't run
concurrent index creation inside a transaction. Add the inverse
(`postgresql_concurrently=True`) on `downgrade`. Test on a populated
staging table: writes against `follows` succeed during the migration.

Required Files Changes :
- backend/alembic/versions/a7b2c9d4e1f5_m6_follow_indexes.py

---

### 7. `follow_user` returns 201 for an *existing* edge — wrong status code

**Severity: Minor**
**Fix required?** YES — HTTP semantics; cheap to fix.

Description :
`routers/users.py:202-254` declares `status_code=201` on the route. When
the upsert hits the conflict path (`row is None`), the handler still
returns 201 — but no new resource was created. The HTTP spec reserves
201 Created strictly for resource creation; idempotent re-follow should
return 200 OK. Clients that branch on status code (some analytics
pipelines treat 201 as "new edge → fire notification") will double-fire
notifications on every retry.

Required Fixes :
Branch the response in the handler: use `Response(status_code=201)` on
the freshly inserted path and `Response(status_code=200)` on the
already-existed path. FastAPI lets you do this by accepting `response:
Response` as a parameter and setting `response.status_code`. Document the
behaviour in the route docstring. Tests: first follow returns 201,
re-follow returns 200, both bodies match `FollowOut`.

Required Files Changes :
- backend/app/routers/users.py
- backend/tests/test_follow_status_codes.py (new)

---

### 8. `/api/users/me/follow` and `/api/users/me/followers` return a confusing 422

**Severity: Minor**
**Fix required?** Optional — fix for UX polish.

Description :
The routes are declared as `/{user_id}/follow` etc. with `user_id: UUID`.
A request to `/api/users/me/follow` fails UUID validation with a 422
"Input should be a valid UUID" — confusing because `/api/users/me` is a
documented endpoint and users will reasonably expect the same path-prefix
to work. The router also doesn't 405 a `GET /follow` — FastAPI defaults
matter here.

Required Fixes :
Two paths: (a) Add an explicit `/me/follow`, `/me/followers`,
`/me/following` set of routes that 405 (you can't follow yourself) and
delegate to the authenticated viewer's id for the lists. Or (b) accept
the 422 and document it. Recommend (a) so the API is consistent. Tests:
GET `/api/users/me/followers` returns the same shape as
`/api/users/{user.id}/followers`.

Required Files Changes :
- backend/app/routers/users.py
- backend/tests/test_users_me_follow_routes.py (new)

---

### 9. `following_only=true` with zero follows silently returns an empty feed

**Severity: Minor**
**Fix required?** Optional — fix for UX clarity.

Description :
A user who hasn't followed anyone yet but flips the "following only"
toggle gets an empty `RidePlanListResponse` with no signal. They can't
distinguish "no one I follow has a ride planned" from "I follow nobody"
from "the API is broken." Empty states without explanation are the most
common UI bug in social products.

Required Fixes :
Surface a hint in the response: either add an optional
`following_count: int` to the response when `following_only=true` is set,
or return a `reason: "no_followed_users"` discriminator on empty
results. Cheaper: precheck `SELECT 1 FROM follows WHERE follower_id =
:user LIMIT 1` and 400 if zero — but a 4xx on an otherwise-valid query
is surprising. Pick one; document it. Tests: user with 0 follows +
`following_only=true` returns the documented hint.

Required Files Changes :
- backend/app/routers/rides.py
- backend/app/schemas/ride.py
- backend/tests/test_ride_feed_following_only.py (new)

---

### 10. Pagination is offset-based — gets slow past page ~50 on big follower lists

**Severity: Minor**
**Fix required?** NO for ship; document for the next iteration.

Description :
`_paginated_follow_list` uses `.offset((page - 1) * limit).limit(limit)`.
For a creator with 100k followers, requesting page 1000 forces Postgres
to scan 50k follow rows (with the join to users) and discard 49,950 to
return 50. Same defect as M2 audit #4 / M5 audit #4, repeated here. The
two new compound indexes (`idx_follows_*_created`) cover the LIMIT path
nicely, but offset-skip still pays.

Required Fixes :
Defer. When social-graph scale matters, add `before: Optional[datetime]`
+ `before_id: Optional[UUID]` keyset cursor. Document on the M6 plan.
Tests deferred too.

Required Files Changes :
- docs/plan/m6-follow-system.md

---

### 11. No rate limit on follow / unfollow — graph-flood vulnerability

**Severity: Minor**
**Fix required?** YES eventually; not a ship blocker for the academic scope.

Description :
A logged-in user can hit `POST /api/users/{id}/follow` in a tight loop.
Each call is cheap (one `ON CONFLICT DO NOTHING`) but produces a write
amplification on the follower count cache layer (none today, but the M2
plan calls for one in M9). An attacker can also harvest the user list by
brute-forcing UUIDs — `follow_user` returns 404 for nonexistent and 400
for self, distinguishing "user exists" from "user doesn't." The
information leak is bounded by UUIDv4 entropy (negligible) but the
follow/unfollow toggle is a natural griefing surface (silent stalking,
notification spam in M9).

Required Fixes :
Add a `slowapi`-backed per-user rate limit on POST/DELETE follow
endpoints (e.g. 60 follow ops per minute). Optionally collapse the 400
and 404 into a single 404 to hide the self-vs-nonexistent distinction.
Tests: 61st follow attempt in a minute returns 429.

Required Files Changes :
- backend/app/routers/users.py
- backend/app/services/limits.py (or shared rate-limit module)
- backend/tests/test_follow_rate_limit.py (new)

---

### 12. No reciprocal-follow signal — `is_followed_by_me` is one direction only

**Severity: Minor**
**Fix required?** NO for ship; UX gap to track for M7.

Description :
`UserOut.is_followed_by_me` answers "do I follow this user?" but not the
inverse "does this user follow me?" Most follow UIs render a "follows
you" badge when the relationship is reciprocal. The data is already
present (just flip the EXISTS direction); shipping without it forces the
frontend to make a second `GET /api/users/{me.id}/followers?contains=...`
call.

Required Fixes :
Add `is_following_me: bool` to `UserOut`. Compute via a second EXISTS
subquery in `_load_user_with_social`. False for `/me` (same self-loop
constraint). Tests: A follows B, GET as A of B's profile → `is_followed_by_me=true,
is_following_me=false`; B follows A back → both true.

Required Files Changes :
- backend/app/schemas/user.py
- backend/app/routers/users.py
- backend/tests/test_reciprocal_follow.py (new)

---

### 13. `follow_user` issues 4 SQL statements in the happy path — collapsible

**Severity: Minor**
**Fix required?** Optional perf cleanup.

Description :
The flow: (1) self-check (no SQL), (2) `_target_user_exists` SELECT,
(3) `ON CONFLICT` INSERT with RETURNING, (4) `db.commit()`. The `_target_user_exists`
check is redundant — the FK constraint on
`follows.followed_id → users.id` will fail the INSERT if the target
doesn't exist. Trading the extra round trip for an IntegrityError handler
gets us to 1 SQL + commit.

Required Fixes :
Drop `_target_user_exists` from `follow_user` (and `unfollow_user` which
has the same pattern). Wrap the INSERT in a try/except IntegrityError;
on FK violation, map to 404. Same for unfollow — but unfollow is a
no-op DELETE that doesn't FK-fail, so add the existence check inline as
a `db.query(User.id).filter(...).first()` only when the DELETE affected 0
rows AND you want to distinguish "no such user" from "not following
them." Tests: follow nonexistent UUID returns 404 with exactly one
SELECT in the SQL log.

Required Files Changes :
- backend/app/routers/users.py

---

### 14. `_paginated_follow_list` joinedload + offset can over-fetch rows on duplicates

**Severity: Minor**
**Fix required?** Verify under load; NOT a blocker.

Description :
`joinedload(relationship_to_load)` LEFT OUTER JOINs the User table into
the SELECT. The cardinality is 1:1 here (each Follow has exactly one
follower and one followed) so duplicates can't arise — but the
`LIMIT` and `OFFSET` apply to the joined row set, not to distinct Follow
rows. Today this is equivalent because of the 1:1 join, but if anyone
later adds `joinedload(relationship_to_load).options(joinedload(User.bike))`
to the chain (perfectly reasonable for a richer follower card), `User`
× `Bike` is still 1:1 but the next reasonable expansion
(`joinedload(User.uploaded_destination_media)`) is 1:N and would silently
break pagination — page 1 would return fewer than `limit` Follow rows.

Required Fixes :
Use `selectinload(relationship_to_load)` instead of `joinedload`.
`selectinload` does a second IN-keyed query and never affects LIMIT semantics.
Slightly more round trips (1 extra), much safer to extend. Tests: extend
the follower card response with a 1:N relationship, assert pagination
returns exactly `limit` rows.

Required Files Changes :
- backend/app/routers/users.py

---

### 15. Frontend `getFollowers` / `getFollowing` / `followUser` return `Promise<unknown>`

**Severity: Minor**
**Fix required?** YES — pattern carried forward from prior audits.

Description :
Carryover from M2/M3/M4/M5 audits — the M6 client methods are not typed.
`unfollowUser` correctly types `Promise<void>` because of the 204 short-
circuit fix from M5 audit #2, but the other three are still `unknown`.
This forces unsafe casts in every consumer and rots silently.

Required Fixes :
Add `frontend/src/lib/api.types.ts` mirroring `FollowOut`,
`FollowEdgeOut`, `FollowListResponse`, and update the four client
methods. Tests: TypeScript compiles without `as` casts at call sites.

Required Files Changes :
- frontend/src/lib/api.types.ts
- frontend/src/lib/api.ts

---

### 16. `_load_user_with_social` overwrites Python attributes on a SQLAlchemy identity-mapped instance

**Severity: Minor**
**Fix required?** Optional cleanup; the current behaviour is correct but fragile.

Description :
The helper sets `user.followers_count = ...` etc. on the SQLAlchemy
ORM instance. The instance is in the session identity map; if the same
User is later accessed via another query in the same request (e.g. as
`Rating.user` from a relationship lookup), it carries these synthetic
attributes. The downstream consumer (a different schema, say `UserBrief`)
ignores them via `from_attributes`, so no harm today. But the pattern
is "mutate the ORM model for serialization convenience," and a future
contributor reading the code can reasonably assume `User.followers_count`
is a real column.

Required Fixes :
Either (a) return a `dict` from the helper and feed it to
`UserOut.model_validate(d)`, or (b) define a `UserViewModel` dataclass
that wraps the User + extras explicitly. (b) is closer to the rest of
the codebase's style. Documents intent and survives static-typing
checks. Tests: same `user.id` accessed via two paths in one request
does not leak `followers_count` into unrelated serializers.

Required Files Changes :
- backend/app/routers/users.py
- (optional) backend/app/services/user_view.py

---

### 17. Mirror M2 audit #10 / #14: JWT secret + CORS are still defaults

**Severity: Minor**
**Fix required?** YES eventually — flagged twice now.

Description :
M6 reuses `get_optional_user` on `/api/users/{id}`,
`/api/users/{id}/followers`, `/api/users/{id}/following`. The M2 finding
about default `SECRET_KEY` and CORS `["http://localhost:3000"]` still
stands; M6 widens the *public-readable* surface (anonymous browser of a
user profile gets `followers_count` / `following_count`), so the
fail-open posture on a default secret expands one more notch.

Required Fixes :
Apply the M2 audit #10 / #14 fixes. No new work — just don't ship
another milestone without them.

Required Files Changes :
- backend/app/config.py
- backend/app/main.py
- backend/app/dependencies.py

---

### 18. `unfollow_user` doesn't distinguish "not following" from "user doesn't exist"

**Severity: Minor**
**Fix required?** NO — current behaviour is intentional per the docstring; minor inconsistency with `follow_user`.

Description :
`unfollow_user` runs `_target_user_exists` and 404s for nonexistent
users, then a no-op DELETE for "not following." The follow path 404s for
nonexistent and 400s for self. The pair is consistent on self-handling
but inconsistent on "the action is unnecessary" — follow returns the
existing edge (201, debatable per #7); unfollow returns 204 silently. Not
a bug, but worth a deliberate call.

Required Fixes :
Document the contract in the route docstring: "Unfollow is idempotent.
Returns 204 whether or not the edge existed. Nonexistent target user
still 404s." If you want symmetry with follow, return 200 vs 204 to
distinguish — but most clients won't act on the difference. Recommend
leaving as-is and documenting.

Required Files Changes :
- backend/app/routers/users.py (docstring)

---

### 19. The frontend has no follow-button component yet, so UI integration is untested

**Severity: Minor**
**Fix required?** Out of M6 scope; document in `m6-follow-system.md`.

Description :
The api.ts methods land but no React component consumes them in this PR.
The `/users/[id]` profile page (if it exists) doesn't render a follow
button. The same gap exists from M3 onward (frontend deferred to UX
track) — calling it out so a UX-track PR explicitly owns the contract
verification.

Required Fixes :
NOT a backend fix. Add a checklist item to `docs/plan/m6-follow-system.md`:
"UX-track owner ships `FollowButton` component consuming `followUser` /
`unfollowUser`, with optimistic state and toast on error." Tests: contract
test that the UI calls the right endpoint with the right shape.

Required Files Changes :
- docs/plan/m6-follow-system.md

---

### 20. `Follow.created_at` has no client-side write guard against clock skew

**Severity: Minor**
**Fix required?** NO; mentioned for completeness.

Description :
`server_default=func.now()` is correct — the timestamp is server-side.
But a client showing "followed 2m ago" relies on its own clock to compute
the delta. If the device clock is wrong, the relative time is wrong.
Standard mobile-app fallback is to use a server-anchored "now" returned
in the response.

Required Fixes :
Defer. If/when the UI ships, add a `server_time: datetime` to the
`FollowOut` response (or in a global `X-Server-Time` header) so clients
can compute relative durations against server time. Tests deferred.

Required Files Changes :
- (deferred)

---

## Triage — ship gate

**Must-fix before merging M6:**

- **#1** Model vs migration index direction mismatch (Alembic-autogenerate poisoning)
- **#2** Auth signup/login returns `followers_count=0` for everyone
- **#3** Multi-entity `db.query(...).options(joinedload(...))` shape risk
- **#5** `home_latitude`/`home_longitude` still unvalidated — second milestone shipping reads on it
- **#6** Migration not `CONCURRENTLY` — bites the next deploy with real data

**Land in a fast-follow (same milestone, separate PR):**

- **#4** Index on `ride_plans.captain_id` (perf for `following_only` and `/mine`)
- **#7** 201 vs 200 for re-follow
- **#13** Drop `_target_user_exists` round-trip in favour of FK-violation catch
- **#14** Switch `joinedload` → `selectinload` in the follow list helper
- **#15** Typed frontend follow methods

**Defer / document only:**

- **#8** `/me/follow` route ergonomics
- **#9** Empty `following_only` feed hint
- **#10** Keyset pagination for big follower lists
- **#11** Rate limit
- **#12** `is_following_me` reciprocal flag
- **#16** Attribute-mutation pattern in `_load_user_with_social`
- **#17** Carry-forward JWT + CORS hardening
- **#18** Unfollow contract docstring
- **#19** Frontend integration tracker
- **#20** Server-time anchor for relative timestamps

## Carryover from prior audits — explicitly NOT re-listing

These appear in earlier audit docs and remain unaddressed but are not
re-flagged here to keep the M6 doc focused:

- M2 audit #4 (SQL vs Python haversine) — still in destinations router
- M2 audit #10 (JWT hardening) — listed lightly as #17 above
- M2 audit #13 (ILIKE wildcard escaping) — still in destinations router
- M2 audit #14 (CORS hardcoded) — listed lightly as #17 above
- M5 audit #5 (chat polling rate limit / ETag) — chat-specific
- M5 audit #6 (chat idempotency key) — chat-specific
- M5 audit #7 (chat soft delete) — chat-specific

## What I checked specifically this round

- Verified `auth.py` does NOT pipe through `_load_user_with_social` →
  finding #2 is a real data bug, not theoretical.
- Verified no index on `ride_plans.captain_id` exists in any M1–M4
  migration → finding #4 is real, not "probably there."
- Verified model `Index` declarations are ASC and migration is DESC →
  finding #1 is a real autogenerate-vs-runtime mismatch.
- Verified `_paginated_follow_list` tiebreaker uses the OTHER FK column
  (part of composite PK) → safe ordering, NOT a bug.
- Verified `pg_insert(...).on_conflict_do_nothing(...)` in `follow_user`
  is atomic — the documented "follow-self is blocked by ck_follow_not_self"
  also holds because the EXISTS subquery in `_load_user_with_social`
  correctly returns false for the self case.
- Verified the unfollow path correctly returns 204 and that the frontend
  `unfollowUser` types as `Promise<void>` — M5 audit #2 stayed fixed.
- Verified the migration revision chain
  (`f1a2b3c4d5e6` → `a7b2c9d4e1f5`) is consistent with the M4 chain
  head — `down_revision` matches.
