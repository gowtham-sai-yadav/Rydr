# M8 — Badges + achievement engine

**Status:** Plan ready — awaiting approval
**Scope:** Backend only. Frontend (profile badge shelf + modal) is a separate UX discussion per the standing rule.
**Owner:** TBD
**Touches:** `backend/app/models/badge.py` (exists), `backend/app/schemas/badge.py` (exists), one new Alembic migration, one new router, one new service module, one new seed script, registration in `backend/app/main.py`.

---

## 1. Goal

Reward users for activity on the platform with publicly visible badges. Make the awarding deterministic, idempotent, and observable.

**Why this matters for the thesis**
- Closes the "social flywheel" loop — riders who complete rides get visible recognition; that recognition lives on their profile and (in M12 polish) on destinations they've ridden.
- Demo-friendly. A badge shelf on the profile gives the report a clean screenshot of the multi-system integration (rides → completion → log → award → display).

---

## 2. Badge catalog (proposed — 8 badges)

Two axes:
- **Rides completed** (you finished a ride — measured by `RideLog` existence OR `RidePlan.status='completed'` you participated in).
- **Captain count** (you led a ride).
- **Joiner count** (you were approved into a ride).
- **Star variant** — a quality marker triggered by something more selective than raw count.

Bronze / Silver / Gold tier names map cleanly to "complete N rides → N tier."

| Slug | Name | Description | Trigger | Tier |
|---|---|---|---|---|
| `first-ride` | First Ride | Completed your first ride | `rides_completed >= 1` | Bronze |
| `rider-bronze` | Three Rides Strong | Completed 3 rides | `rides_completed >= 3` | Bronze |
| `rider-silver` | Six Rides Strong | Completed 6 rides | `rides_completed >= 6` | Silver |
| `rider-gold` | Ten Rides Strong | Completed 10 rides | `rides_completed >= 10` | Gold |
| `captain-bronze` | First Captain | Captained your first ride | `rides_captained >= 1` | Bronze |
| `captain-silver` | Squad Leader | Captained 5 rides | `rides_captained >= 5` | Silver |
| `joiner-bronze` | Joiner | Joined 3 ride groups (approved) | `rides_joined >= 3` | Bronze |
| `star-rider` | Star Rider ⭐ | Completed 3 rides AND posted a 5★ rating on a destination | `rides_completed >= 3 AND any RideLog.stars=5` | Star |

**Star tier:** the only badge whose predicate is *quality-gated*, not just count-gated. The user verbatim asked for a "star badge" distinct from the regular bronze/silver/gold count tier — this slot fills that.

---

## 3. Open decisions (need sign-off before implementation)

| # | Decision | Default proposal | Why |
|---|---|---|---|
| 1 | **Icon delivery** | Iconify CDN URLs in `Badge.icon_url` (e.g. `https://api.iconify.design/...`). No package install — frontend just renders `<img src={icon_url}>`. | The `icon_url` field already exists. Iconify is a free public CDN with 200k+ icons. No new backend dep, no new env var. **If you'd rather host icons ourselves (Cloudinary) or use emoji, say so before I seed.** |
| 2 | **Award timing** | Synchronous, on every ride-status change + ride-log create + participant approval. | Cheap (8 SELECTs + maybe 1 INSERT) and demo-deterministic. No queue / background worker — sticks to "one Postgres, no new datastore." |
| 3 | **What counts as "rides_completed"** | Number of `RideLog` rows owned by user (their *own* post-ride capture), NOT `RidePlan.status='completed'` they were in. | A log = the rider personally said "I finished this." More truthful than "ride was marked completed by the captain." |
| 4 | **Joiner count** | Approved `RidePlanParticipant` rows where `user_id != captain_id` of the plan. | Excludes the auto-self-join when you create a ride (otherwise captains get the joiner badge for free). |
| 5 | **Public visibility** | All earned badges visible on any user's public profile (`GET /api/users/{id}/badges`). | Matches the user ask ("see badges of different people"). |
| 6 | **Revoking badges** | No revoke. Once earned, kept. | Even if a ride gets deleted post-hoc. Avoids ugly "you lost a badge" UX. |
| 7 | **Migration backfill** | One-shot seed script runs the engine for every existing user. | Otherwise deb + the seeded users start with empty shelves. |

If any answer above is wrong, redirect before I implement.

---

## 4. Files touched

**New**
- `backend/alembic/versions/<rev>_m8_badges.py` — create `badges` + `user_badges` tables.
- `backend/app/services/badge_engine.py` — `evaluate_user_badges(db, user_id)`. Reads stats, INSERTs missing UserBadge rows ON CONFLICT DO NOTHING.
- `backend/app/routers/badges.py` — three endpoints (see §5).
- `backend/scripts/seed_badges.py` — populates catalog + runs backfill across all users.

**Modified**
- `backend/app/main.py` — register badges router under `/api/badges`.
- `backend/app/routers/rides.py` — call `evaluate_user_badges` after ride status change to `completed`, and after participant approval.
- `backend/app/routers/ride_logs.py` — call `evaluate_user_badges` after a log is created.

**Untouched but referenced**
- `backend/app/models/badge.py` (already correct — no schema changes needed beyond the migration).
- `backend/app/schemas/badge.py` (already correct).

---

## 5. Endpoints

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `GET` | `/api/badges` | List the badge catalog (slug, name, description, icon_url). | optional |
| `GET` | `/api/users/me/badges` | My earned badges, with `earned_at` + nested catalog row. | required |
| `GET` | `/api/users/{id}/badges` | Any user's earned badges. Returns 404 if user not found. | optional |

All three return DTOs already declared in `schemas/badge.py` (`BadgeOut`, `UserBadgeOut`).

**Not in scope (frontend):** modal viewer, badge-detail page, badge notifications, badge-earned toasts. Those go in a separate UX plan.

---

## 6. Engine pseudocode

```python
# services/badge_engine.py
def evaluate_user_badges(db, user_id):
    stats = compute_stats(db, user_id)         # 4 cheap counts
    catalog = db.query(Badge).all()            # 8 rows, cached per process
    for badge in catalog:
        if predicate_holds(badge.slug, stats):
            db.execute(
                pg_insert(UserBadge)
                  .values(user_id=user_id, badge_id=badge.id)
                  .on_conflict_do_nothing(index_elements=["user_id", "badge_id"])
            )
    db.commit()
```

- `compute_stats` returns `(rides_completed, rides_captained, rides_joined, has_5_star_log)`.
- `predicate_holds` is a small dispatch table keyed on `slug`.
- One commit per evaluation. Idempotent — re-running is a no-op once badges are awarded.

---

## 7. Migration

Single Alembic revision. Creates:

```sql
CREATE TABLE badges (
  id UUID PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NOT NULL,
  icon_url VARCHAR(500)
);

CREATE TABLE user_badges (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_badge UNIQUE (user_id, badge_id)
);

CREATE INDEX ix_user_badges_user_id ON user_badges (user_id);
CREATE INDEX ix_user_badges_badge_id ON user_badges (badge_id);
```

The `uq_user_badge` constraint is what makes the engine's upsert safe.

---

## 8. Test plan (manual smoke — same approach as M9)

After implementation, extend `/tmp/m9_endpoint_smoke.py` (or a new `m8_badges_smoke.py`) with:

1. `GET /api/badges` → 200, returns 8 catalog rows with non-empty `icon_url`.
2. `GET /api/users/{deb}/badges` (no auth) → 200, deb has at least `first-ride`, `captain-bronze`, `joiner-bronze` from her seeded data.
3. Re-run seed script → no duplicate rows in `user_badges` (idempotency).
4. Create a fresh user via signup → `GET /api/users/me/badges` → 200, empty array.
5. Have that user join + complete one ride → `evaluate` fires → `first-ride` appears on retry.

---

## 9. Out of scope (deferred)

- Badge categories / sections (we'd add `category` column later if needed).
- Time-limited / event badges (e.g. "Monsoon Rider 2026").
- Badge progression UI ("2 of 6 rides toward Silver").
- Push / email notifications on award.
- Achievements leaderboard.
- Badge revocation when underlying data is deleted.
- Frontend display — separate plan.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| Synchronous evaluate slows down ride-status writes | Engine is ~8 SELECTs + 1 INSERT. Benchmarked mentally at < 5 ms for catalog of 8. If we ever cross 50 badges, move to a post-commit hook. |
| Iconify CDN goes down | `icon_url` is nullable — frontend falls back to a default placeholder. Easy to swap to Cloudinary-hosted later. |
| Backfill on a million-user table is slow | We have 7 users. Non-issue for Phase 3. |
| Star-rider predicate creep | Locked at "3 rides + any 5★ log." If we later want "3 rides AND avg≥4★," that's a separate badge slot. |
