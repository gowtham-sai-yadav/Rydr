# M6 — Follow system

**Status:** Finalized 2026-05-28. Backend-only this milestone — frontend wiring
is consolidated into M9 along with every other deferred UI piece (per the
project decision to ship all backends first and connect the frontend in one
focused pass at the end).
**Class:** Core.
**Effort estimate:** ~3–4 days backend.
**Task ID:** #14.

---

## Goal

Let a user **follow** another rider, **unfollow** them, and see lists of who
follows them and who they follow. Expose follower / following counts and a
`is_followed_by_me` flag on public profiles. Add a `following_only` filter
on the rides feed so a rider can see only group rides captained by people
they follow.

Exit criterion (PHASE3_PLAN §6 M6):

> User can follow/unfollow; "following" tab on feed shows filtered content.

## Depends on

- **M1** — `Follow` table exists (composite PK `(follower_id, followed_id)` + `CheckConstraint("follower_id != followed_id")`). Verified in `backend/alembic/versions/b4e6c8f2a1d3_m1_destination_schema.py:387–396`.
- **M3** — `RidePlan.captain_id` is the join surface for the `following_only` feed filter.
- **M2/M3/M4/M5** — no direct dependency, but M6 reuses the audit-tightened patterns from all of them (single-query gating, `.id` tiebreakers, atomic upserts, eager loading).

## External dependencies

**None.** No new pip packages, env vars, or third-party services. No new tables either — schema patch is two indexes.

## Decisions resolved (each with reasoning, not just a verdict)

| Question | Decision | Reasoning |
|---|---|---|
| URL convention | **Sub-resource**: `POST /api/users/{id}/follow`, `DELETE /api/users/{id}/follow`, `GET /api/users/{id}/followers`, `GET /api/users/{id}/following`. | Matches the established convention from M3 (`/api/rides/{id}/participants`) and M4 (`/api/ride-logs/{id}/media`). A top-level `/api/follows` resource would split the conceptual unit. |
| Idempotency | `POST` while already following → **200 OK** with the existing row. `DELETE` while not following → **204 No Content**. Using `pg_insert(...).on_conflict_do_nothing(...)` for atomic insert. | Same atomic-upsert pattern as M5 ride-log create and M2 rating upsert. Double-tap on a "Follow" button shouldn't 500 or duplicate. |
| Self-follow | API returns **400 with clear message** before even touching the DB. The check constraint `ck_follow_not_self` is the belt; the API gate is the braces. | Cheap pre-check avoids a `IntegrityError → 500` translation if the DB raises. |
| Follower / following lists privacy | **Public** — `GET /followers` and `GET /following` are auth-optional. | Phase 3 spec is "everything public". M9 can revisit if a privacy gate is added. |
| `is_followed_by_me` on `/users/{id}` | **Add `get_optional_user` dep**; the field is `False` for anonymous callers and `False` for `/me`. | Anonymous shouldn't see follow state; `/me` can't follow itself. |
| Counts computation | **Scalar subqueries inside the main user SELECT.** One round trip instead of three. | Pattern from M2 atomic rating aggregate UPDATE — fold derived fields into the primary query, no separate COUNTs. |
| Counts denormalization | **No** — recompute on read. | Phase 3 traffic is low; denorm needs trigger maintenance or in-handler invariants. Push to M9 if a perf signal demands. |
| `following_only` on `/api/rides/feed` | Filter rides where `captain_id IN (SELECT followed_id FROM follows WHERE follower_id = :me)`. | "See rides led by people I follow" is the most natural reading. We don't expand to "rides where any approved participant is followed" — too noisy. |
| Mutual follows / friend-of-friend / suggestions | **Out** — post-Phase 3. | Adds complexity without flywheel value at this scope. |
| Block / mute primitives | **Out** — M9 or post-Phase 3. | No abuse model exists yet; adding without a real signal is premature. |
| Notifications on receive-follow | **Defer to M9** alongside every other `# TODO M6:` marker in M3/M4/M5 routers. | User explicitly narrowed M6 to follow CRUD; notifications are a cross-cutting feature that wants its own pass. The `# TODO M6:` comments stay as overloaded markers for the M9 catch-up. |
| Destinations-from-followed feed | **Out** — defer to M9. | "Destinations my followees recently rode" requires joining destinations → ride_plans → ride_logs → users → follows. Heavy query; questionable Phase 3 value. |
| Tests | Skip pytest; verify by curl. | Same pattern as every milestone since M1. M9 owns the test suite. |
| Pagination | `page=1, limit=50, max=100`. Tiebreaker: `(created_at DESC, follower_id ASC)` for followers and `(created_at DESC, followed_id ASC)` for following. | M2 audit #4 pattern adapted to Follow's composite PK — the second column of the PK is the deterministic tiebreaker. |

## Schema patch (the only delta from M1)

The M1 migration created `follows` with composite PK on `(follower_id, followed_id)` and no other indexes. Postgres can use the **leading column** of a composite index for prefix lookups, so:

- `WHERE follower_id = :id` → uses the PK index ✅ (fast)
- `WHERE followed_id = :id` → **does NOT use the PK index** ❌ (sequential scan)

M6 hits both query shapes:
- `GET /following` → `WHERE follower_id = :me` (PK index works)
- `GET /followers` → `WHERE followed_id = :me` (needs a new index)
- `feed?following_only=true` → subquery `SELECT followed_id FROM follows WHERE follower_id = :me` (PK index works)

Plus both lists order by `created_at DESC` for "newest follower first" UX. Adding `created_at` to the index lets Postgres avoid a separate sort step.

The migration adds:

```python
op.create_index(
    "idx_follows_followed_created",
    "follows",
    ["followed_id", sa.text("created_at DESC")],
)
op.create_index(
    "idx_follows_follower_created",
    "follows",
    ["follower_id", sa.text("created_at DESC")],
)
```

The `follower_id` one is somewhat redundant with the PK for equality lookups, but adding `created_at` to it enables fast "ordered by recency" without a sort. Cheap insurance — both indexes are tiny.

`follows` is empty in seed data, so backfill cost is zero.

## Scope — backend

### Endpoints (added to `routers/users.py`)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/users/{user_id}/follow` | **required** | Idempotent follow; returns `FollowOut` |
| DELETE | `/api/users/{user_id}/follow` | **required** | Idempotent unfollow; returns 204 No Content |
| GET | `/api/users/{user_id}/followers` | optional | Paginated list of followers (`UserBrief` rows + `followed_at`) |
| GET | `/api/users/{user_id}/following` | optional | Paginated list of who they follow |
| GET | `/api/users/{user_id}` | **optional (was: none)** | Extended `UserOut` with `followers_count`, `following_count`, `is_followed_by_me`. The `get_optional_user` addition is the only change to the auth contract — existing anonymous callers still work. |
| GET | `/api/users/me` | required (no change) | `UserOut` with the same three new fields (`is_followed_by_me` always `False`). |

### Updated endpoint — `routers/rides.py`

| Method | Path | Change |
|---|---|---|
| GET | `/api/rides/feed` | New optional query param `following_only: bool = False`. When `true`, requires auth (else 400). Filters captains in `SELECT followed_id FROM follows WHERE follower_id = :me`. |

### Schema additions / extensions

`schemas/social.py`:

```python
class FollowEdgeOut(BaseModel):
    """A row in the followers / following list — wraps a UserBrief with
    the timestamp the relationship was created."""
    user: UserBrief
    followed_at: datetime

class FollowListResponse(BaseModel):
    edges: List[FollowEdgeOut] = []
    total: int
    page: int
    limit: int
```

`schemas/user.py` — extend `UserOut`:

```python
class UserOut(BaseModel):
    ...                                       # existing fields
    followers_count: int = 0
    following_count: int = 0
    is_followed_by_me: bool = False           # always False for /me and anon
```

Defaults so existing seed / fixture paths don't break.

### Concurrency & query patterns (audit lessons applied)

- **Atomic follow**: `pg_insert(Follow).values(...).on_conflict_do_nothing(constraint="pk_follows")` — same pattern as M5 ride-log create. Fall back to fetch when conflict.
- **Eager loading** on follow-list responses: `joinedload(Follow.follower)` / `joinedload(Follow.followed)` so we don't N+1 when projecting to `UserBrief`.
- **Single-query user fetch**: `GET /users/{id}` uses scalar subqueries for the counts and the `is_followed_by_me` EXISTS, all rolled into the main SELECT. One round trip vs four.
- **Tiebreaker**: `order_by(Follow.created_at.desc(), Follow.followed_id.asc())` for followers list and the symmetric `.follower_id.asc()` for following. Composite PK columns are deterministic tiebreakers.
- **404 on missing user** in all three sub-resource paths before any follow-side work.

### Frontend api.ts stubs (typed signatures only, no UI)

Per the user direction — all frontend page work for M2–M6 is consolidated into M9. Only the API client gets touched:

```ts
followUser(userId: string): Promise<unknown>
unfollowUser(userId: string): Promise<void>     // 204 → void via the M5 audit-fix in request<T>
getFollowers(userId: string, params: { page?, limit? }): Promise<unknown>
getFollowing(userId: string, params: { page?, limit? }): Promise<unknown>
getUser(userId: string): Promise<unknown>       // already exists, no signature change
getRideFeed(params: { ..., following_only?: boolean }): Promise<unknown>
```

## Out of scope (explicit deferrals)

| Item | Why | Where it lands |
|---|---|---|
| Notifications on follow / approve / mention / etc. | User narrowed M6 to follow CRUD only. Notifications are a cross-cutting feature that touches M3/M4/M5/M6 routers and needs a dedicated table + endpoint. | **M9** — consolidated with all `# TODO M6:` markers. |
| Frontend follow button, profile page, followers/following lists | All frontend page work for the project deferred to a single M9 connect pass per project direction. | **M9** |
| Mutual-follow / friend-of-friend / suggestions | Adds complexity, no flywheel value at Phase 3 scope. | post-Phase 3 |
| Block / mute | No abuse signal yet. | M9 or post-Phase 3 |
| Destinations-from-followed | Heavy join; questionable value with 5–15 seeded destinations. | **M9** if pursued |
| Counters denormalization | Phase 3 traffic is low; COUNT(*) on follows table with ≤ 100 rows is microseconds. | **M9** if perf demands |
| `block_at` / `muted_at` on Follow | No primitive for blocking; adding the column without a use case is dead schema. | post-Phase 3 |

## Verification plan (no pytest in M6)

After implementation, with seeded users (alex, sam, jordan, casey, riley, morgan):

1. `./run.sh` boots DB; new migration applied.
2. Curl matrix:
   - `POST /api/users/{sam_id}/follow` as alex → 201 with `FollowOut`
   - `POST /api/users/{sam_id}/follow` as alex (again) → 200 same row (idempotent)
   - `POST /api/users/{alex_id}/follow` as alex (self) → 400 with clear message
   - `POST /api/users/{bogus_uuid}/follow` as alex → 404
   - `GET /api/users/{sam_id}` (no auth) → `followers_count=1, following_count=0, is_followed_by_me=false`
   - `GET /api/users/{sam_id}` as jordan → `is_followed_by_me=false`
   - `GET /api/users/{sam_id}` as alex → `is_followed_by_me=true`
   - `GET /api/users/me` as alex → `following_count=1, is_followed_by_me=false`
   - `GET /api/users/{sam_id}/followers` → 1 edge with `user.name="Alex Rider"`
   - `GET /api/users/{alex_id}/following` as alex → 1 edge with `user.name="Sam Cruz"`
   - `DELETE /api/users/{sam_id}/follow` as alex → 204
   - `DELETE /api/users/{sam_id}/follow` as alex (again) → 204 (idempotent)
   - `GET /api/users/{sam_id}` after unfollow → `followers_count=0`
   - **Following-feed**: alex follows sam; sam creates a group ride; `GET /api/rides/feed?following_only=true` as alex returns that ride. As jordan (not following sam): empty result.
   - `GET /api/rides/feed?following_only=true` without auth → 400 with clear message
   - Pagination: create 30+ follow edges, page through with `limit=10`, assert no skip / no dup

## Files touched

**New:**
- `backend/alembic/versions/{rev}_m6_follow_indexes.py` — two indexes

**Modified:**
- `backend/app/models/social.py` — add `__table_args__` with the two indexes (mirror the migration so SQLAlchemy autogeneration stays consistent)
- `backend/app/schemas/social.py` — add `FollowEdgeOut`, `FollowListResponse`
- `backend/app/schemas/user.py` — extend `UserOut` with the three follow fields
- `backend/app/routers/users.py` — 4 new follow endpoints + `get_optional_user` on `GET /{user_id}`; refactor the user-fetch to scalar-subquery COUNTs + EXISTS
- `backend/app/routers/rides.py` — `following_only` param on `/feed`
- `frontend/src/lib/api.ts` — 4 new stubs + add `following_only` to `getRideFeed`

**Not modified:** No model file beyond `social.py` (no new tables). No `main.py` changes (no new router). No new pip deps.

## Exit criteria (PHASE3_PLAN.md)

> User can follow/unfollow; "following" tab on feed shows filtered content.

Met when the verification matrix passes, including the following-only feed slice.

## Frontend debt opened by M6

Consolidated into **M9 frontend connect pass**:
- Public profile page `/users/[id]` with follow button + counters
- Followers list, Following list
- "Following" toggle on the rides feed UI
- (No new pages broken — existing pages don't reference follow data)

## Frontend debt closed by M6

None — backend-only milestone.

## What I am explicitly NOT assuming

Verified against actual code before writing this plan:

- ✅ `Follow` table has composite PK on `(follower_id, followed_id)` and check constraint `ck_follow_not_self` — confirmed in `alembic/versions/b4e6c8f2a1d3_m1_destination_schema.py:387–396`.
- ✅ `Follow` table has **no secondary indexes** — confirmed by grepping the M1 migration; PK is the only index. The `followed_id` lookup is currently a sequential scan.
- ✅ `User.followers` / `User.following` SQLAlchemy relationships exist with the right `foreign_keys` annotations — confirmed in `models/user.py:67–78`.
- ✅ `schemas/social.py:FollowOut` already exists with `follower_id, followed_id, created_at` — confirmed; we'll add the list response wrapper, not replace.
- ✅ `routers/users.py::get_user` (`GET /{user_id}`) has **no auth dep** today — confirmed at `routers/users.py:86–91`. Adding `Depends(get_optional_user)` is the only auth-contract change.
- ✅ `routers/rides.py::ride_feed` accepts `destination_id, region, date_from, date_to, page, limit` — confirmed at `routers/rides.py:220–224`. Adding `following_only` is additive.
- ✅ `seed.py` has **no Follow rows** — confirmed by grep. M6 verification creates follows via the API.
- ✅ `request<T>` in `frontend/src/lib/api.ts` already handles 204 No Content correctly (M5 audit fix #2). The new `unfollowUser` returns `Promise<void>` for free.
- ✅ No notification code exists anywhere in the codebase — confirmed by `semantic_search_nodes_tool` returning zero matches for "notification". The `# TODO M6:` markers in M3/M4/M5 routers are orphans that M6 won't close (consolidated to M9 per scope decision).

Anything outside this list is a documented decision with reasoning, not an assumption.

---

## Audit response — second pass (2026-05-28)

The M6 audit (`docs/review/phase3-m6-follow-system-audit.md`) raised 20
findings. Triage and resolution:

### Landed in this PR (real M6 bugs)

| # | Fix | What changed |
|---|---|---|
| 1 | Model index direction matches migration (DESC) | `models/social.py` switched from `"created_at"` to `text("created_at DESC")` on both compound indexes. Verified via `alembic revision --autogenerate` producing an **empty** migration (no drift). |
| 2 | Auth flow returns real follow counts | Extracted `_load_user_with_social` to `backend/app/services/user_view.py`; both signup and login now pipe through it. Verified: alex login returns `following_count=1` (was 0 before fix); sam login returns `followers_count=2` (was 0). |
| 3 | Multi-entity query joinedload risk | Switched `User.bike` loader from `joinedload` to `selectinload` in `user_view.load_user_with_social`. `selectinload` is one extra IN-keyed SELECT but safe under any relationship cardinality and unaffected by mixed-entity query shape. |
| 4 | Index on `ride_plans.captain_id` | New migration `c3d8e6f4b9a2_m6_ride_plans_captain_index.py` adds compound `(captain_id, planned_date DESC)`. `__table_args__` entry in `models/ride.py` mirrors. Confirmed via `pg_indexes`. Covers `/api/rides/mine` and `/api/rides/feed?following_only=true`. |
| 14 | `joinedload` → `selectinload` in follow lists | `_paginated_follow_list` swapped. Same fragility argument as #3 — `joinedload` + LIMIT/OFFSET silently breaks under future 1:N relationship expansion. |
| 18 | Unfollow contract documented | `unfollow_user` docstring explains idempotency: 204 whether or not the edge existed, 404 for nonexistent target, 400 for self-unfollow. |

### False positive (verified)

- **#5** — `home_latitude` / `home_longitude` validation. Audit claimed "still unaddressed" but the M2 audit response **already applied** `Field(default=None, ge=-90, le=90)` to both `UserUpdate` (schemas/user.py:77-78) and `SignupRequest` (schemas/auth.py:27-28). Verified by grep against current code. The audit doc is stale on this point.

### Deferred (with reason)

| # | Item | Why we're not doing it in M6 |
|---|---|---|
| 6 | `CONCURRENTLY` index creation | `follows` is empty in seed data, M6 index creation takes microseconds. Academic project — production-deploy hardening is M9. |
| 7 | 201 vs 200 for re-follow | Project-wide convention has been "idempotent create-like endpoints return 201" since M5. Changing it here would be inconsistent — sweep all such endpoints together in **M9** if HTTP-spec purity is wanted. |
| 8 | `/me/follow` route ergonomics | UX polish; frontend can compute `me.id` from `/me` and use the regular path. **M9**. |
| 9 | Empty `following_only` feed hint | Frontend concern (call `/me` first, check `following_count > 0` before rendering toggle). UX track. |
| 10 | Keyset pagination for big follower lists | Academic-scope traffic (≤ 100 follows per user); offset is fine. Document for **M9** if perf signal demands. |
| 11 | Rate limit on follow/unfollow | Consistent with all prior rate-limit deferrals to **M9** (PHASE3 §4.1 item 10). |
| 12 | `is_following_me` reciprocal flag | Feature, not bug. Useful for "follows you" badge UI; add when the UX track requests it. |
| 13 | Drop `_target_user_exists` round-trip | Trades one cheap SELECT for `IntegrityError`-catching complexity. The current pattern is correct and easier to reason about for an academic-scope codebase. Not worth the risk for ~1ms savings. |
| 15 | Typed `Promise<T>` in api.ts | **M9** repo-wide typing pass (consistent with M2/M3/M4/M5 deferrals). |
| 16 | Attribute-mutation pattern in `_load_user_with_social` | Code smell, not bug. Sticking computed values on the ORM instance is a widely-used FastAPI pattern; cleanup to a `UserViewModel` is **M9** hygiene. |
| 17 | JWT/CORS hardening carry-forward | **M9** — explicit milestone for auth hardening per PHASE3_PLAN §4.1 item 10. |
| 19 | Frontend integration | All frontend page work consolidated into the **M9** connect pass per project direction. |
| 20 | Server-time anchor for relative timestamps | UI concern; defer until the UX track ships timestamps. |

### Carry-forward (still open from M2, not re-listed in this audit)

- M2 #4 (SQL vs Python haversine) — destinations router
- M2 #13 (ILIKE wildcard escaping) — destinations router
- Both still open; will land in M9 alongside the broader audit deferrals.
