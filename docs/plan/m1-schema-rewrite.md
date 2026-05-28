# M1 — Schema rewrite + Alembic migration

**Status:** Plan ready. Awaiting team approval before implementation.
**Class:** Core (blocks all subsequent milestones).
**Effort estimate:** ~1 week.
**Task ID:** #9 (in_progress).

---

## 1. Goal

Replace the PoC's Ride-centric schema with the Destination-centric schema from `PHASE3_PLAN.md §5`. Ship one clean Alembic revision, a rewritten seed script, and minimal router updates to keep auth + profile working. After M1, the backend supports the full Phase 3 data shape; M2 onward builds UX and features on top.

## 2. Dependencies

### External (services / libraries)

**None.** M1 introduces no new Python or JS packages. All tools already in `backend/requirements.txt`:
- SQLAlchemy 2.0 (ORM)
- Alembic 1.13 (migrations)
- Pydantic v2 (schemas)
- psycopg2-binary (Postgres driver)

No Cloudinary, ImageKit, Mapbox, or any third-party service wiring in M1. Those land in M2/M4.

### Prerequisite tasks (M0)

From `PHASE3_PLAN.md §7` — some relaxed per rolling team agreement:

| Task | Required for M1? | Status |
|---|---|---|
| #1 Dev environment sanity | Yes — team should run `./run.sh --dev` once | pending |
| #3 Lock 8 open decisions | Partially — decisions affecting M1 already confirmed in conversation | pending |
| #6 Seed destination research (full 10–15) | **No** — M1 ships with 5 placeholder destinations; full research needed before M2 demo | pending |
| #7 Team approves PHASE3_PLAN.md | Yes — primary thesis + scope agreed | pending |
| Account setups (#2, #5, #8) | No — not needed until M2/M4 | pending |

## 3. Scope

### In scope
- All new SQLAlchemy models per this plan
- One clean Alembic revision (`m1_destination_schema`) — drop existing tables, create new
- Rewritten Pydantic schemas for new entities
- Rewritten `backend/app/seed.py` — users (6), bikes (extended), tags (catalog), badges (catalog), destinations (5 placeholder, geographically spread)
- Minimal router updates: `auth.py` + `users.py` accept new columns; `rides.py` stubbed; `chat.py` unchanged

### Out of scope (deferred to later milestones)
- Frontend changes (deferred per `feedback_ui_ux_separate_track` — UX discussion required first)
- Full destination list (10–15 real destinations with photos) — M0 task #6 before M2 demo
- Cloudinary/ImageKit integration — M4
- Mapbox integration — M2
- Communities tables — M10 (stretch)
- GPS trace table — M11 (stretch)
- Real-time layer (websockets/SSE) — M11 (stretch)
- Follow notifications — M6
- Badge awarding logic — M8 (schema only in M1)

## 4. Data model

### 4.1 Extended tables

#### `users`
Add nullable columns (existing users survive re-seed):
- `home_city` — `String(100)`, nullable — plain text city name
- `home_latitude` — `Float`, nullable — used by M2 radius filter when present
- `home_longitude` — `Float`, nullable
- `created_at` — `TIMESTAMP WITH TIME ZONE`, default `now()`
- `updated_at` — `TIMESTAMP WITH TIME ZONE`, default `now()`, auto-updated on change

Remaining columns unchanged: `id`, `name`, `email`, `phone`, `password_hash`, `avatar_url`, `bio`.

#### `bikes`
Add:
- `engine_cc` — `Integer`, nullable — used by M2 vehicle-fit matching
- `mileage_kmpl` — `Float`, nullable — used by M2 cost calculator
- `type` — `ENUM('commuter', 'sport', 'adventure', 'cruiser', 'any')`, default `'any'`

Remaining columns unchanged: `id`, `user_id`, `name`, `model`, `year`.

### 4.2 Renamed tables

| Old name | New name | Notable changes |
|---|---|---|
| `rides` | `ride_plans` | + `destination_id` FK (not null), + `route_id` FK (nullable), + `visibility` ENUM('solo','group') default 'group', + `planned_date DATE`, + `planned_start_time TIME`, + `estimated_end_time TIME` (was String) |
| `ride_participants` | `ride_plan_participants` | FK column renamed `ride_id` → `ride_plan_id` |
| `chat_groups.ride_id` (col) | `chat_groups.ride_plan_id` | FK target renamed |

Date/time columns migrate from `String(20)` → proper `Date` / `Time` in the rename (addresses Appendix B item #4).

### 4.3 New tables

#### `destinations` — primary entity
- `id` UUID PK
- `name` String(200) not null
- `description` Text nullable
- `region` String(100) nullable — user-typed (e.g. "Himachal", "Western Ghats")
- `country` String(100) default `'India'`
- `currency` **String(3) default `'INR'`** — ISO 4217 code, enables future multi-country support
- `latitude` Float not null
- `longitude` Float not null
- `terrain_difficulty` ENUM('chill','moderate','rough') default `'moderate'`
- `estimated_food_cost` Integer nullable — in destination's `currency` unit (whole rupees for INR)
- `estimated_entry_cost` Integer nullable — same unit
- `best_season` String(100) nullable — e.g. "Oct–Feb"
- `best_time_of_day` String(50) nullable — e.g. "Early morning"
- `hero_media_url` String(500) nullable
- `avg_rating` Float default `0.0` — denormalized for feed sort
- `rating_count` Integer default `0` — denormalized
- `submitted_by_user_id` UUID FK `users.id` nullable — null for seeded
- `created_at`, `updated_at` TIMESTAMPTZ

Indexes:
- `idx_destinations_region` on `(region)`
- `idx_destinations_latlng` on `(latitude, longitude)` — for radius queries (Haversine per Appendix C)

#### `tags` — catalog
- `id` UUID PK
- `slug` String(50) unique not null — e.g. `'waterfall'`, `'100cc_plus'`
- `label` String(100) not null — e.g. "Waterfall"
- `category` ENUM('vibe','vehicle_fit') not null

Seeded values:
- **vibe:** waterfall, mountain, coastal, temple, food-trail, offbeat, viewpoint, fort, beach, forest
- **vehicle_fit:** any, 100cc_plus, 150cc_plus, adventure, 4x4_only

#### `destination_tags` — M2M
- `destination_id` UUID FK `destinations.id` (CASCADE on delete)
- `tag_id` UUID FK `tags.id` (CASCADE on delete)
- PK (`destination_id`, `tag_id`)

#### `destination_media`
- `id` UUID PK
- `destination_id` UUID FK (CASCADE)
- `url` String(500) not null
- `caption` String(500) nullable
- `uploaded_by_user_id` UUID FK `users.id` nullable
- `ride_log_id` UUID FK `ride_logs.id` nullable — set when media came from a ride capture
- `created_at` TIMESTAMPTZ

#### `routes` — optional curated path
- `id` UUID PK
- `destination_id` UUID FK (CASCADE)
- `name` String(200) nullable — e.g. "via Yamuna Expressway"
- `description` Text nullable
- `created_by_user_id` UUID FK `users.id` nullable
- `created_at` TIMESTAMPTZ

#### `route_points` — ordered path geometry
- `id` UUID PK
- `route_id` UUID FK `routes.id` (CASCADE)
- `ordinal` Integer not null — order within route
- `latitude` Float not null
- `longitude` Float not null
- `label` String(200) nullable
- `is_stop` Boolean default `false` — if this point is a break/photo stop
- Index: `idx_route_points_route_order` on `(route_id, ordinal)`

#### `ride_logs` — executed ride
- `id` UUID PK
- `ride_plan_id` UUID FK `ride_plans.id` (CASCADE)
- `rider_id` UUID FK `users.id` not null — the specific rider logging this (not necessarily captain)
- `actual_start_ts` TIMESTAMPTZ nullable
- `actual_end_ts` TIMESTAMPTZ nullable
- `actual_cost` Integer nullable — in INR (later multi-currency via destination)
- `road_condition` ENUM('good','ok','rough','bad') nullable
- `recommended` Boolean nullable — would-you-recommend y/n
- `notes` Text nullable
- `created_at`, `updated_at` TIMESTAMPTZ

#### `ride_media` — content from a ride
- `id` UUID PK
- `ride_log_id` UUID FK (CASCADE)
- `url` String(500) not null
- `media_type` ENUM('image','video') default `'image'`
- `uploaded_by_user_id` UUID FK `users.id`
- `caption` String(500) nullable
- `created_at` TIMESTAMPTZ

#### `ratings` — destination rating
- `id` UUID PK
- `destination_id` UUID FK (CASCADE)
- `user_id` UUID FK (CASCADE)
- `stars` Integer (1–5) not null — CHECK constraint
- `review` Text nullable
- `ride_log_id` UUID FK `ride_logs.id` nullable — optional link to originating ride
- `created_at`, `updated_at` TIMESTAMPTZ
- UNIQUE (`destination_id`, `user_id`) — one rating per user per destination

#### `follows` — one-way
- `follower_id` UUID FK `users.id` (CASCADE)
- `followed_id` UUID FK `users.id` (CASCADE)
- `created_at` TIMESTAMPTZ default `now()`
- PK (`follower_id`, `followed_id`)
- CHECK: `follower_id != followed_id`

#### `discussions` — destination-scoped threads
- `id` UUID PK
- `destination_id` UUID FK (CASCADE)
- `author_id` UUID FK `users.id`
- `title` String(200) not null
- `body` Text not null
- `created_at`, `updated_at` TIMESTAMPTZ

#### `discussion_comments` — 1-level nesting
- `id` UUID PK
- `discussion_id` UUID FK (CASCADE)
- `author_id` UUID FK `users.id`
- `parent_comment_id` UUID FK self nullable — if set, must point to a comment whose own `parent_comment_id` is null (enforced in service layer, not DB)
- `body` Text not null
- `created_at`, `updated_at` TIMESTAMPTZ

#### `badges` — static catalog
- `id` UUID PK
- `slug` String(50) unique not null
- `name` String(100) not null
- `description` String(255) not null
- `icon_url` String(500) nullable

Seeded catalog (6 badges):
| slug | name | description |
|---|---|---|
| first_ride | First Ride | Complete your first ride log |
| dawn_patrol | Dawn Patrol | Start a ride before 7:00 AM |
| century_club | Century Club | Complete a ride of 100 km or more |
| destination_collector | Destination Collector | Visit 5 unique destinations |
| storyteller | Storyteller | Upload 10 photos across rides |
| early_adopter | Early Adopter | Joined Rydr during Phase 3 launch |

#### `user_badges` — awards
- `id` UUID PK
- `user_id` UUID FK (CASCADE)
- `badge_id` UUID FK
- `earned_at` TIMESTAMPTZ default `now()`
- UNIQUE (`user_id`, `badge_id`)

#### `chat_messages` — real chat (replaces MOCK)
- `id` UUID PK
- `chat_group_id` UUID FK `chat_groups.id` (CASCADE)
- `author_id` UUID FK `users.id` (CASCADE)
- `body` Text not null
- `created_at` TIMESTAMPTZ default `now()`
- Index: `idx_chat_messages_group_time` on `(chat_group_id, created_at)`

### 4.4 Dropped tables

- `rides` (replaced by `ride_plans`)
- `ride_stops` (replaced by `route_points` scoped to routes)
- `ride_participants` (replaced by `ride_plan_participants`)

### 4.5 Deferred to their own milestones

- `communities`, `community_members`, `community_invites` → M10
- `gps_traces` → M11

## 5. Alembic migration strategy

- Single revision: `alembic revision -m "m1_destination_schema"`
- Autogenerate is **not** used — the diff is too large and wouldn't handle renames cleanly. Revision is hand-written.
- **Upgrade path (clean drop-and-recreate):**
  1. `op.drop_table('chat_groups')` (will be recreated with new FK name)
  2. `op.drop_table('ride_participants')`, `op.drop_table('ride_stops')`, `op.drop_table('rides')`
  3. `op.drop_table('bikes')`, `op.drop_table('users')` (recreated with extensions)
  4. Create ENUM types (new ones)
  5. Create all tables in FK-correct order: `users`, `bikes`, `tags`, `badges`, `destinations`, `destination_tags`, `destination_media`, `routes`, `route_points`, `ride_plans`, `ride_plan_participants`, `ride_logs`, `ride_media`, `ratings`, `follows`, `discussions`, `discussion_comments`, `user_badges`, `chat_groups`, `chat_messages`
  6. Create indexes
- **Downgrade path:** full inverse — recreates the old schema. Exists for correctness; we won't use it in practice (reset + re-seed is easier).
- The existing `3c0a0b736b45_initial_schema` migration stays in history; M1 revision bases `down_revision` on it.

After M1: `./run.sh reset` becomes the standard path to get to a clean state, since the migration drops everything.

## 6. Seed script rewrite

Full rewrite of `backend/app/seed.py`. Idempotent — skips if any `User` exists.

### 6.1 Users (6, same names, `password123`)
Alex Rider, Sam Cruz, Jordan Miles, Casey Storm, Riley Vance, Morgan Blake.
**No `home_city` set in seed** — user prompted to fill in via M2 UX.

### 6.2 Bikes (1 per user)
Name, model, year as before, plus: `engine_cc`, `mileage_kmpl`, `type`.
Example: Honda CB650R / 650cc / 21 kmpl / sport.

### 6.3 Tags (15 total — 10 vibe + 5 vehicle_fit)
Catalog listed in §4.3 above.

### 6.4 Badges (6)
Catalog listed in §4.3 above. Icon URLs are placeholder Unsplash/SVG for now.

### 6.5 Destinations (5, spread across regions)

| Name | Region | Tags (vibe + fit) | Country / Currency |
|---|---|---|---|
| Nandi Hills | Karnataka | viewpoint, mountain, offbeat / any | India / INR |
| Tirthan Valley | Himachal Pradesh | mountain, forest, offbeat / 150cc_plus, adventure | India / INR |
| Gokarna | Karnataka | beach, coastal, temple / any | India / INR |
| Chikmagalur | Karnataka | mountain, forest, food-trail / 100cc_plus | India / INR |
| Lansdowne | Uttarakhand | mountain, forest, offbeat / 150cc_plus | India / INR |

Each gets: realistic lat/lng, 2–3 vibe tags, 1–2 vehicle-fit tags, 1 hero Unsplash URL, 2–3 gallery URLs (also Unsplash), rough cost estimates (food ₹300–800, entry ₹0–100), best_season, best_time_of_day.

### 6.6 No pre-seeded RidePlans or RideLogs
Clean slate. The demo flow later shows a rider creating a plan from scratch on a seeded destination.

## 7. Router changes

### 7.1 `backend/app/routers/auth.py`
- `signup` endpoint: add optional `home_city`, `engine_cc`, `mileage_kmpl`, `bike_type` to `SignupRequest`.
- Response: include new fields via updated `UserOut` / `BikeOut`.

### 7.2 `backend/app/routers/users.py`
- `UserUpdate` gains `home_city`, `home_latitude`, `home_longitude`.
- `BikeUpdate` gains `engine_cc`, `mileage_kmpl`, `type`.
- No new endpoints.

### 7.3 `backend/app/routers/rides.py` — stubbed
Temporary behavior until M3 rewrites this router:
- `GET /api/rides/feed` → `{"rides": [], "total": 0, "page": 1}`
- `GET /api/rides/mine` → `{"rides": []}`
- `POST /api/rides/` → HTTP 501 `{"detail": "Ride planning under rework in M3"}`
- `GET /api/rides/{id}` → HTTP 404
- All other endpoints → HTTP 501

Rationale: keeps the app booting and frontend HTTP calls from crashing while M3 is in flight.

### 7.4 `backend/app/routers/chat.py` — unchanged
Still returns `MOCK_MESSAGES`. M5 replaces it with real `ChatMessage` queries.

## 8. Files touched

### Created
- `backend/app/models/destination.py` — Destination, Tag, DestinationTag, DestinationMedia, Rating
- `backend/app/models/route.py` — Route, RoutePoint
- `backend/app/models/ride_log.py` — RideLog, RideMedia
- `backend/app/models/social.py` — Follow, Discussion, DiscussionComment
- `backend/app/models/badge.py` — Badge, UserBadge
- `backend/app/schemas/destination.py`, `route.py`, `ride_log.py`, `social.py`, `badge.py`
- `backend/alembic/versions/<hash>_m1_destination_schema.py`

### Modified
- `backend/app/models/__init__.py` — import new model modules so Alembic sees them
- `backend/app/models/user.py` — add columns
- `backend/app/models/ride.py` — rename classes, add FKs, change date/time column types
- `backend/app/models/chat.py` — add ChatMessage; rename FK column
- `backend/app/schemas/user.py`, `ride.py`, `chat.py` — match new shapes
- `backend/app/routers/auth.py`, `users.py`, `rides.py` — per §7
- `backend/app/seed.py` — full rewrite

### Not touched
- Any file under `frontend/` — per `feedback_ui_ux_separate_track`

## 9. Currency handling

- `destinations.currency` stores ISO 4217 code (`'INR'` default for Phase 3)
- `destinations.estimated_food_cost`, `destinations.estimated_entry_cost`, `ride_logs.actual_cost` stay plain integers, interpreted in the destination's `currency`
- Currency formatting is a display concern handled in the frontend when UX ships
- Future multi-country: new destinations saved with e.g. `currency='USD'`; cost calculator will need per-currency fuel price tables — deferred

## 10. What breaks after M1 (expected)

- Frontend `/rides` → empty list (API returns `[]`)
- Frontend `/rides/[id]` → 404 from API
- Frontend `/rides/create` → 501 on submit
- Frontend `/chat` → still shows mock messages until M5
- Everything else (signup, login, profile) → working

Accepted per team decision — frontend remains as-is until UX discussion + M3/M5 frontend rewrites.

## 11. Exit criteria

Milestone M1 is complete when:
- [ ] All new models defined and imported into `models/__init__.py`
- [ ] Alembic revision applied cleanly on a fresh database (`./run.sh reset` works)
- [ ] `./run.sh --dev` boots without errors
- [ ] Seed runs idempotently — 6 users, 5 destinations, tags, badges created
- [ ] OpenAPI docs at `/docs` render all new Pydantic schemas correctly
- [ ] `GET /api/users/me` returns new shape (`home_city`, `home_latitude`, `home_longitude`, extended `bike` object)
- [ ] `GET /api/rides/feed` returns `{"rides":[],"total":0,"page":1}` without error
- [ ] Existing seeded user can log in and see their profile (frontend may render partially; that's fine)
- [ ] Plan reviewed and approved by team before merge

## 12. Open questions (all answered, no blockers)

| # | Question | Answer |
|---|---|---|
| 1 | Clean drop-and-recreate migration? | Yes — agreed 2026-04-19 |
| 2 | Currency: INR integer? | Yes — add `currency` column on destinations, default `'INR'`, costs as plain integers |
| 3 | Seed destination names? | Locked: Nandi Hills, Tirthan Valley, Gokarna, Chikmagalur, Lansdowne |
| 4 | Frontend changes bundled? | **No** — deferred per `feedback_ui_ux_separate_track` |
| 5 | Geography-agnostic? | Yes — no hard-coded region; user provides home_city |
| 6 | `RidePlan.destination_id` required? | Yes — enforces destination-first thesis |
| 7 | Discussions destination-scoped only? | Yes |
| 8 | Follow relationship one-way? | Yes |

No blockers remain. Ready for team review.

## 13. After M1, next steps

- **M2** starts with destination discovery API (list endpoint + filter + detail + cost calc) — backend-first. Frontend waits for UX.
- Task #6 (real destination research, 10–15 entries with photos) must complete before M2's demo to replace the 5 placeholders.
- UX discussion for M2+ frontend should be scheduled around the same time M1 lands.
