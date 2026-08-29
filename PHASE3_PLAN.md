# Rydr — Phase 3 Plan

**Project:** Rydr — A community-driven scenic routing & social platform for moto riders
**Team:** Navneet, Debashis Maharana, Gowtham Sai G
**Advisor:** Swapnil Swarav
**Phase:** 3 (Full-scale implementation)
**Document owner:** The team. Last revised: 2026-04-18.

---

## 0. TL;DR

Phase 3 builds Rydr around a **destination-first discovery engine** with a **post-ride data flywheel**. The Phase 1/2 PDFs framed Rydr as "Google Maps + Strava + Instagram + Reddit unified" — a pitch too broad to ship. Phase 3 narrows the thesis to a sharper job-to-be-done ("help a rider decide where to ride this weekend") and reorders the PDF's original feature set as a dependency graph serving that thesis. No features from the PDFs are cut permanently; some are deferred to Phase 4+ so the core loop ships end-to-end within Phase 3.

---

## 1. The thesis (product definition)

> **Rydr helps a rider — especially a new or solo one — answer "where should I ride this weekend?" — with scenic destinations filtered by distance, vibe, cost, and vehicle fit, enriched by the community that's already been there, and captured again when you come back.**

**Primary user:** A rider with the itch to ride but no local knowledge. Doesn't know where to go, what it costs, whether their bike suits the terrain, or who to go with.

**Core job-to-be-done:** Turn "I want to ride somewhere this weekend" into a concrete plan, ideally with company, in under 5 minutes.

**Moat / why-it-compounds:** The **data flywheel**. Riders visit a destination → post photos, actual cost, road condition, feedback → destination data gets richer → next rider gets a better answer → more riders come → more data. Every feature either feeds the flywheel or benefits from it.

---

## 2. Contrast with Phase 1/2 PDFs

| Dimension | Phase 1/2 PDFs | Phase 3 (this plan) |
|---|---|---|
| One-line pitch | "Google Maps + Strava + Instagram + Reddit for riders, unified" | "Help a rider answer *where should I ride this weekend?*" |
| Primary user | Riders in general (fuzzy) | New/solo rider with no local knowledge (sharp) |
| Core entity | Routes, Rides, Posts (flat) | **Destination** as primary; everything orbits it |
| Differentiator | "Scenic over shortest route" (weak — Google does this) | **Discovery + cost + vehicle fit + flywheel** (unsolved in India) |
| Cost estimation | Not mentioned | **Core** — fuel (auto from bike mileage) + food/entry (static) |
| Vehicle suitability | Not mentioned | **Core** — per-destination tags, matched to user's bike |
| Post-ride capture | Implied | **Core flywheel** — explicit feedback, rating, actual cost |
| GPS tracking | Core (FR3) | Stretch — useful for trace capture, not the thesis |
| Social feed | Core (FR4) | Posts attached to rides/destinations; no standalone feed (Phase 4+) |
| Discussions | Core (FR5) | **Core** — destination-scoped threads (not global forum) |
| Follow system | Implied | **Core** — drives engagement |
| Badges | Core (FR6) | **Core** — simple achievement engine |
| Leaderboards, stories | Core (FR6, FR4) | Phase 4+ |
| Tech stack | Android/React Native + MapBox | Next.js PWA (web) + Cloudinary + Mapbox (display only) |

**Mapping of PDF FRs to Phase 3 plan:**

| PDF FR | Phase 3 milestone | Status |
|---|---|---|
| FR1 — auth + profile + bike | M1 | Kept, enhanced with home-location + bike mileage |
| FR2 — scenic route recommendations | M2, M3 | Evolved into destination discovery (vibe + radius + vehicle + budget) |
| FR3 — ride logging (GPS) | M11 | Stretch — live GPS sharing |
| FR4 — photo/video/story sharing | M4 | Media attached to rides (flywheel); standalone feed deferred |
| FR5 — discussions + likes/comments | M5, M7 | Ride chat + destination-scoped discussions |
| FR6 — leaderboards + milestones + badges | M8 | Badges in Phase 3; leaderboards Phase 4+ |

**Defensible narrative for the report:**

> *"Phase 1–2 scoped Rydr as a unified platform combining navigation, tracking, social, and community paradigms. During Phase 3, deeper problem analysis revealed that the primary unmet need is discovery — a new or solo rider has no mechanism to decide where to ride, what it'll cost, or whether their vehicle suits the terrain. We re-anchored the product around destination discovery as the core thesis and reordered the original feature set as a dependency graph serving that thesis. Features not directly contributing to the core discovery + planning + capture loop (live GPS tracking, leaderboards, standalone social feed, stories) are scoped into future phases. This narrowing lets us deliver a defensible, end-to-end working product within Phase 3 rather than a surface-level implementation of all six FRs."*

---

## 3. Guiding principles

Written down so they're not re-litigated mid-build:

1. **Destination is the primary entity.** Routes, Rides, Posts, Discussions all orbit Destinations.
2. **Every feature feeds or benefits from the flywheel.** If it doesn't, it waits.
3. **Geography-agnostic.** The app works for a rider in Kerala, Himachal, Maharashtra, or anywhere. User input drives location.
4. **Mobile-first web (PWA), not native.** Faster iteration, cross-platform free, native rewrite is a Phase 4+ choice.
5. **Depth over breadth.** One feature that works end-to-end beats three that half-work.
6. **Paper before code.** Schema, API surface, and UX flows are agreed in writing before a migration runs.
7. **No re-inventing solved problems.** We deep-link Google Maps for navigation. We use Cloudinary for video. We use Mapbox for map rendering. We don't build these.

---

## 4. Phase 3 scope

### 4.1 What we ARE building

**Core (must ship):**
1. **User + Bike + home-location + bike mileage** — inputs to cost calc
2. **Destination model + discovery** — filter by vibe tags × radius × vehicle-fit × budget
3. **Destination detail** — map, photos, community rating, cost breakdown, tips, "riders who went recently"
4. **Ride planning** — solo + group (refactor existing flow to reference `destination_id`)
5. **Ride chat** — async, real (replace the current mocked `MOCK_MESSAGES`)
6. **Post-ride capture** — media upload, rating, actual cost, road condition, recommend-yes/no → enriches destination
7. **Follow system** — follow/unfollow riders, "following" feed filter
8. **Destination-scoped discussions** — thread per destination, one level of nested comments
9. **Badges + achievement engine** — 6–8 badges, event-triggered, profile display, toast on earn
10. **Code quality pass** — TypeScript typing on API client, API tests (pytest), date-column migration, auth hardening (httpOnly cookies or refresh-token pattern), rate limiting basics

**Stretch (only if core lands clean and time remains):**

11. **Communities** — user-created groups, email-invite, public/private, simple membership
12. **Live GPS sharing during a ride** — Start Ride → periodic position push → map markers for ride group

### 4.2 What we are NOT building (explicitly)

Write this down so nobody re-litigates it mid-build.

- **Turn-by-turn navigation** — we deep-link Google Maps
- **Standalone social feed (Instagram home tab)** — posts live on rides/destinations; no algorithmic feed
- **Instagram-style stories** — Phase 4+
- **Leaderboards** — need critical mass first; Phase 4+
- **Reddit-style global discussion forum** — destination-scoped threads only
- **Multi-leg trip planning** (A → B → C → home) — single destination per ride
- **Native mobile app (React Native)** — PWA-responsive web is sufficient for Phase 3
- **Offline maps / offline mode** — Phase 4+
- **Fuel price live feeds / live weather** — static estimates + seasonal tags
- **Ticket, stay, and entry-fee booking integrations** — not our problem
- **Monetization (ads, premium, bookings)** — Phase 4+
- **Admin moderation tooling** — manual DB edits for now
- **Strava-style solo ride auto-logging** — manual logging + stretch GPS

### 4.3 Confirmed pivots (need advisor defense in report)

- **React Native → Next.js PWA:** team-velocity reasons; native rewrite is Phase 4+ if the product finds traction.
- **Leaderboards cut from Phase 3:** engagement features earn their keep only with user mass; building them before that is decoration.

---

## 5. Data model (entities on paper)

Full SQLAlchemy and Alembic detail comes in M1. High-level shape:

### 5.1 Core entities

- **User** — identity, profile, home-location (lat/lng + city), followers/following counts
- **Bike** — belongs-to User; fields: name, model, year, engine_cc, mileage_kmpl, type (commuter/sport/adventure/cruiser/any)
- **Destination** — primary. Fields: name, region, country, lat/lng, vibe_tags[], terrain_difficulty, vehicle_fit_tags[], est_food_cost, est_entry_cost, best_season, best_time_of_day, hero_media_url, avg_rating, rating_count, submitted_by_user_id
- **DestinationTag** — normalized tags (waterfall, mountain, coastal, temple, food-trail, offbeat, viewpoint, fort, beach, forest)
- **DestinationMedia** — photos/videos attached to a destination (via RideLog or direct submission)
- **Route** — optional curated path from a start point to a Destination. If absent, the app deep-links Google Maps.
- **RoutePoint** — ordered lat/lng points on a Route (for drawing on map)
- **RidePlan** — planned trip. Fields: destination_id, captain_id, planned_date, planned_start_time, visibility (solo/group), status (planned/in_progress/completed/cancelled), max_riders
- **RideParticipant** — many-to-many between RidePlan and User; status (pending/approved/rejected/left)
- **RideLog** — the executed trip. Fields: ride_plan_id, actual_start_ts, actual_end_ts, actual_cost, road_condition, recommend_yes_no, gps_trace_id (stretch), notes
- **RideMedia** — photos/videos attached to a RideLog (links back to Destination too)
- **ChatGroup** / **ChatMessage** — per-ride chat (real messages now)
- **Rating** — polymorphic: Destination rating from a User (1–5 + review text), one per user per destination
- **Follow** — User-follows-User, created_at
- **Discussion** — belongs-to Destination. Fields: author_id, title, body, created_at
- **DiscussionComment** — belongs-to Discussion, one level of nesting
- **Badge** — static catalog; triggered awards stored in **UserBadge** (user_id, badge_id, earned_at)

### 5.2 Stretch entities

- **Community** — user-created group; fields: name, description, visibility (public/private), creator_id
- **CommunityMember** — user_id, community_id, role (member/admin), joined_at
- **CommunityInvite** — email, community_id, token, expires_at
- **GpsTrace** — ride_log_id, compressed list of timestamped lat/lng points

### 5.3 The flywheel (visual)

```
          +-------------------+
          |    DESTINATION    |<----------------+
          |  (rich data grows)|                 |
          +-------------------+                 |
                   |                            |
                   | (rider discovers)          |
                   v                            |
          +-------------------+                 |
          |    RIDE PLAN      |                 |
          +-------------------+                 |
                   |                            |
                   | (rider rides)              |
                   v                            |
          +-------------------+                 |
          |     RIDE LOG      |                 |
          +-------------------+                 |
                   |                            |
                   | (rider captures)           |
                   v                            |
          +-------------------+                 |
          | MEDIA + FEEDBACK  |-----------------+
          |  + RATING         |  (enriches destination)
          +-------------------+
```

---

## 6. Milestones

Each milestone ends in a **demo-able state** — you could stop at any milestone and still have a coherent product. Effort estimates assume a 3-person team at part-time intensity (roughly 15–20 hours/week per person).

| M | Name | Effort | Exit criteria |
|---|---|---|---|
| M0 | Plan lock + prerequisites | 2–3 days | This doc approved; all accounts set up; seed destinations researched |
| M1 | Schema rewrite + migration | 1 week | New models, Alembic revision applied, reseed runs clean |
| M2 | Destination discovery | 1.5 weeks | User can filter by tag + radius + vehicle + budget and see ranked list |
| M3 | Ride planning on destinations | 1 week | User can plan solo/group ride targeting a destination; captain approval works |
| M4 | Post-ride capture + Cloudinary | 1 week | User finishes ride → uploads media + rating + feedback; destination data updates |
| M5 | Real ride chat | 3–4 days | Messages persist; users in a ride can send/read |
| M6 | Follow system | 1 week | User can follow/unfollow; "following" tab on feed shows filtered content |
| M7 | Destination discussions | 1 week | Any user can start a thread on a destination, others can reply one level deep |
| M8 | Badges + engine | 1 week | 6–8 badges defined, triggers wired, earned on events, visible on profile |
| M9 | Code quality pass | 1 week | Types tightened, API tests added, auth hardened, dates migrated to proper types |
| M10 | Communities (stretch) | 1 week | Create/join community, email invite, public/private |
| M11 | Live GPS sharing (stretch) | 1.5–2 weeks | Rider starts ride, position pushes to backend, group sees markers move |
| M12 | Polish + demo + report | 1 week | Demo scripted, polished UI, Phase 3 report drafted |

**Total core (M0–M9): ~8 weeks.** Stretch adds 3–4 more.

### Milestone dependency graph

```
M0 -> M1 -> M2 -> M3 -> M4 -> M5
                    \            \
                     \            +-> M6 (follow)
                      \           +-> M7 (discussions)
                       \          +-> M8 (badges)
                        +-------------> M9 (quality) -> M12 (close-out)

Stretch:
M10 (communities) after M8
M11 (GPS) after M9
```

M6/M7/M8 can run in parallel across team members if we split ownership cleanly.

---

## 7. What's required FIRST (prerequisites to starting M1)

These are the actionable items that must be complete before M1 begins. Do these in week 0.

### 7.1 Decisions to lock (this doc)

- [ ] Team reads this doc and approves / pushes back in writing
- [ ] **Timeline bracket** chosen: 4 / 8 / 12 / 16+ weeks. **Recommendation: 8 weeks core + up to 4 weeks stretch.**
- [ ] **Option A confirmed** (posts attached to rides/destinations; no standalone social feed)
- [ ] **Discussion scope: destination-scoped** (not global forum)
- [ ] Per-person hours-per-week commitment documented (so we can sanity-check the 8-week estimate)

### 7.2 Third-party account setup

- [ ] **Cloudinary** account — for larger media (ride photos, videos). Free tier is enough for Phase 3. Need: cloud name, API key, API secret.
- [ ] **ImageKit** account — for thumbnails + avatars. Free tier. Need: public key, private key, URL endpoint.
- [ ] **Mapbox** account — for map display on destination detail and stretch GPS view. Free tier covers 50k loads/mo. Need: public token.
- [ ] All keys stored in `.env` (local) + team-shared secret manager (1Password / Bitwarden / Vault). **Never commit keys to git.**

### 7.3 Seed destination research

This is grunt work but unblocks the demo from feeling empty.

- [ ] Spreadsheet of **10–15 real destinations**, each with:
  - Name, region, lat/lng, country
  - 2–4 vibe tags (from: waterfall, mountain, coastal, temple, food-trail, offbeat, viewpoint, fort, beach, forest)
  - Terrain difficulty (chill / moderate / rough)
  - Vehicle-fit tags (any / 100cc+ / 150cc+ / adventure / 4x4-only)
  - Estimated food/entry cost (INR bands: <200, 200–500, 500–1000, 1000+)
  - Best season + best time of day
  - Hero photo (CC-licensed or team's own)
  - 2–3 gallery photos
- [ ] Since the app is geography-agnostic, **spread the list across regions** — a Bangalore rider should see 3+ options, a Delhi rider should see 3+, etc. Mix South/North/West/East India at minimum.

### 7.4 Dev environment sanity check

- [ ] `docker-compose up -d` spins Postgres; backend `uvicorn app.main:app --reload` runs
- [ ] `npm run dev` in `frontend/` serves on localhost:3000
- [ ] Existing auth flow works end-to-end (signup → login → see home)
- [ ] Alembic migration pipeline is confirmed working (try a no-op migration)

### 7.5 Working-agreements within the team

- [ ] Git branching strategy: `main` protected, feature branches `m<milestone>/<feature>` (e.g., `m2/destination-filters`), PR review before merge
- [ ] Owner per milestone — one person is DRI (directly responsible) per M, others review
- [ ] Weekly sync cadence — 30min standup to call out blockers
- [ ] Definition-of-done per milestone: exit criteria in section 6 + one working demo + PR reviewed + branch merged

---

## 8. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Scope creep — "let's add leaderboards" mid-M4 | **High** | Derails timeline | Section 4.2 is the line. Any addition means something else gets cut. |
| Seed destination research takes longer than expected | Medium | Empty demo | Start in week 0 (prerequisite), not week 2 |
| Cloudinary / Mapbox free tier limits hit mid-build | Low | Blocked demo | Monitor usage; Cloudinary free = 25GB storage, Mapbox free = 50k map loads |
| Team members unavailable (exams, other commitments) | **High** | Timeline slips | Build 20% slack into estimates; M10/M11 are stretch and honestly optional |
| GPS tracking (M11) rabbit-holes — battery, accuracy, live sync | Medium | Blocks M12 | M11 is explicitly stretch. If M9 slips, cut M11 without guilt. |
| React Native pivot defense fails with advisor | Low | Report rewrite | Section 4.3 captures the defense. Commit to it early, don't wobble. |
| Auth security gaps surfaced in review | Medium | Report criticism | M9 includes auth hardening. Don't skip M9. |
| Chat spam / abuse in demo | Low | Embarrassment | Chat is per-ride (invite-only). Discussions are per-destination (public). Add a rate-limit basic in M9. |

---

## 9. Open decisions (explicit sign-off needed)

These are assumptions I've baked into this plan. If any is wrong, flag it **before** M1 starts. Changing after M1 is expensive.

1. **Timeline bracket: 8 weeks core + up to 4 stretch.** Confirm or adjust.
2. **Tech stack: Next.js PWA + FastAPI + Postgres + Cloudinary + ImageKit + Mapbox.** No React Native in Phase 3. Confirm.
3. **Destination-scoped discussions only.** No global forum. Confirm.
4. **Posts attached to rides/destinations only.** No standalone social feed tab. Confirm.
5. **GPS tracking is stretch (M11), not core.** Confirm.
6. **Communities are stretch (M10), not core.** Confirm.
7. **Geography-agnostic — no hardcoded region.** Seed has 10–15 spread across India. Confirm.
8. **Manual moderation via DB edits in Phase 3.** No admin panel. Confirm.

---

## 10. Roadmap beyond Phase 3

Not a promise — a rough ordering of what comes after, so we know where today's "not doing" items land.

**Phase 4 (post-academic, if the product finds traction):**
- Standalone social feed + algorithmic ranking
- Instagram-style stories
- Regional + all-time leaderboards
- Native mobile app (React Native or Flutter)
- Live weather integration
- Multi-leg trip planning
- Admin / moderation panel

**Phase 5+:**
- Monetization (premium, partnerships, bookings)
- Sponsorships and rider-group partnerships
- Trip insurance / safety integrations
- Expansion to cars / cyclists (the PDF's multi-vehicle extension)
- Offline maps

---

## 11. Glossary

- **Destination** — a specific place a rider would go (Nandi Hills, Tirthan Valley, Gokarna). Primary entity.
- **Route** — a curated path *to* a Destination. Optional.
- **RidePlan** — a planned trip (solo or group), targeting a Destination.
- **RideLog** — the *executed* trip. Carries the post-ride media + feedback.
- **Flywheel** — the data loop: rider → visit → capture → enriches destination → attracts next rider.
- **Captain** — creator of a group RidePlan; approves/rejects participants.
- **Community** — user-created group of riders, stretch scope.
- **Vibe tag** — lightweight category for a Destination (waterfall, mountain, coastal, etc.).
- **Vehicle-fit tag** — which classes of bike suit a Destination (any, 100cc+, 150cc+, adventure, 4x4-only).

---

## Appendix A — PDF references

- Phase 1 PRD: `/file final.pdf` (2026-02-02)
- Phase 2 design + PoC: `/phase2.pdf` (2026-02-16)
- Both kept as historical context. Phase 3 follows this document.

---

## Appendix B — Code quality debt: issue → milestone mapping

This table captures every concern raised during the initial codebase audit and where it gets resolved. Most dissolve in the schema rewrite (M1) or are replaced by real implementations (M4, M5). The remainder is caught in the dedicated quality pass (M9). Nothing is silently dropped.

| # | Issue flagged in audit | Resolved in | How it gets fixed |
|---|---|---|---|
| 1 | No `Route` entity — PRD's core differentiator missing | **M1** | Schema rewrite introduces `Destination` as primary (stronger than Route — it reflects the actual product). Route becomes optional, curated path to a Destination. |
| 2 | "Ride" conflates plan and log | **M1** | Split into `RidePlan` (intent, captain, participants, status) and `RideLog` (execution: media, feedback, rating, GPS trace). |
| 3 | Chat is theatre — `MOCK_MESSAGES` hardcoded in `chat.py` | **M5** | Real `ChatMessage` model + send/list endpoints replace the mock. Async (no websocket in M5). |
| 4 | `ride_date`, `start_time` stored as `String` | **M1** | New schema uses `Date` / `Time` / `DateTime` columns from day one. String dates never carry over. |
| 5 | No timezone handling anywhere | **M1 + M9** | Timezone-aware timestamps in M1. UI-side localization + server `TIMESTAMPTZ` in M9. |
| 6 | `ride_to_out` hand-rolled serializer — brittle, inconsistent with Pydantic `response_model` | **M1–M3** | New routers use Pydantic `response_model` uniformly. Hand-rolled serializer disappears with the rewrite. |
| 7 | Frontend API client returns `unknown` everywhere; callers cast with `as { rides: Ride[] }` | **M9** | Proper TypeScript generics on API client. Type-safe end-to-end from backend schemas to frontend consumers. |
| 8 | Zero tests in the repo | **M9** | pytest for every API router (happy path + at least one error case each). Frontend gets a minimal Vitest/Playwright stub and one smoke test for the signup flow. |
| 9 | JWT stored in `localStorage` — XSS-stealable | **M9** | Move to httpOnly cookies OR add refresh-token pattern with short-lived access tokens. Decision made during M9. |
| 10 | No rate limiting, no password complexity | **M9** | `slowapi` (or equivalent) on auth endpoints. Password rules enforced in the signup validator. |
| 11 | CORS hardcoded to `localhost:3000` | **M9** | Read allowed origins from env var. Document production config. |
| 12 | Seed data is LA-centric (Palomar, Joshua Tree, Mulholland) | **M0 prereq** | Seed destination research task compiles 10–15 real destinations spread across Indian regions. |
| 13 | `requirements.txt` instead of `pyproject.toml`, no Ruff / Black / pre-commit | **M9** | Migrate to `pyproject.toml`. Ruff + pre-commit hooks for Python. Prettier + ESLint for frontend. |
| 14 | No migration strategy documented | **M1** | Single clean Alembic revision. Drop prototype tables. Reseed against new schema. Documented in M1 PR. |
| 15 | Auth uses SHA / bcrypt but no password policy | **M9** | Add minimum-length + basic strength check at signup. Don't go overboard (not a banking app). |

### Why we don't fix these *before* M1

Fixing them before the rewrite is work we throw away:
- Polishing `ride_to_out` now → the `Ride` model is deleted in M1 entirely.
- Adding tests against current routers now → most routers get rewritten in M1–M3.
- Migrating date columns now → still have to run the M1 migration, so we'd pay the cost twice.

**Discipline: rewrite eats the small bugs; M9 catches what's left.** This is why M9 is a full week, not a 2-day afterthought.

### What M9 concretely delivers

Not a vague "cleanup" milestone — a real week of focused work with these deliverables:

- [ ] TypeScript API client with proper generics (no more `unknown` / `as` casts)
- [ ] pytest backend test suite — one happy-path + one error case per router
- [ ] Auth hardening — httpOnly cookies or refresh-token pattern, rate limiting on auth endpoints, password policy
- [ ] Timezone-aware dates end-to-end (if any gap remains after M1)
- [ ] Tooling — `pyproject.toml`, Ruff, pre-commit hooks, Prettier, ESLint configs
- [ ] CORS + all secrets moved to env vars
- [ ] Input validation audit — confirm no raw SQL, no direct string interpolation in queries
- [ ] README + SETUP.md for the final repo state

---

## Appendix C — Database choice rationale

**Decision (2026-04-18):** Single database, **PostgreSQL**. No NoSQL. No secondary datastore for Phase 3. Redis evaluated for Phase 4+ only if a concrete pain point surfaces.

### Why one database

1. **Operational simplicity.** A 3-person team without dedicated DevOps can run one DB well; running two poorly is worse than running one well.
2. **Transactional integrity.** Phase 3 workflows span multiple entities per action (ride completion → update RideLog + Destination.avg_rating + award badge + notify followers). A single DB lets these happen atomically in one transaction. Cross-DB consistency is a distributed-systems problem we don't need.
3. **Postgres is multi-paradigm.** It covers every workload class Rydr has:
   - Relational → native
   - Document / flexible-schema → `jsonb` columns
   - Geospatial (radius queries from user's home location to destinations) → Haversine SQL formula (MVP) or PostGIS extension (if we want it cleaner)
   - Full-text search (destinations, discussions) → `tsvector` + GIN index
   - Time-series (GPS trace samples in M11 stretch) → partitioned table OR TimescaleDB extension
   - Graph-like (follow relationships) → many-to-many with indexes in both directions
4. **Academic defensibility.** "One database, one source of truth" is a stronger defense than "we used MongoDB for chat because it scales" at a scale where nothing needs to scale.
5. **Reversibility.** If Phase 4+ grows a specific workload that genuinely outgrows Postgres, we can migrate that workload out. Premature separation is wasted work.

### Datastores we are NOT adding

| Datastore | Would solve | Why we don't add it |
|---|---|---|
| MongoDB | Flexible-schema documents | `jsonb` columns cover this without ops burden |
| Elasticsearch | Full-text search | `tsvector` + GIN index scales to millions of rows fine for Phase 3 |
| Cassandra / DynamoDB / ScyllaDB | Massive-scale writes | Scale we don't have; ops burden we can't afford |
| InfluxDB | Time-series (GPS) | Postgres partitioning or TimescaleDB extension is sufficient |
| Neo4j | Graph relationships | Follow graph is a 2-table many-to-many, not a graph problem |
| Redis (now) | Cache / session / rate-limit | Not justified yet; revisit at M9 auth hardening |

### "Other stores" we DO use (not databases)

These aren't databases in the operational sense — they're managed SaaS that store blobs we shouldn't keep in Postgres:

- **Cloudinary** — large media (photos, videos) from rides (M4)
- **ImageKit** — thumbnails and avatars with transform pipeline (M4)
- **Mapbox** — map tiles, rendered client-side only (M2)

Postgres holds only references (URLs, IDs) to content stored in these services. No consistency issue because the URLs are just strings.

### Triggers for revisiting this decision

We add a second datastore only when ALL of these are true:

1. A specific query or workload is demonstrably slow under Postgres at Phase 3 scale (measured, not hypothetical)
2. Postgres-native solutions (indexing, caching layer, materialized views) have been tried and found insufficient
3. The operational cost of the new datastore is less than the engineering cost of keeping the workload on Postgres

Redis is the most likely first addition — session store if we move JWT to httpOnly cookies (M9), or cache for hot destination-feed queries (M9 or later). Both are "small additions with clear upside"; neither is needed pre-M9.

### Geospatial implementation choice (open)

For radius queries ("destinations within 50km of me"), two options:

- **Plain Haversine SQL formula** — no extension needed, portable. Adequate for Phase 3 scale. **Recommended for MVP.**
- **PostGIS extension** — richer (GiST indexes, polygons, projections), slightly more setup. Worth it only if we later want drawn-region queries or route-along-a-line.

**Decision:** Haversine for M2. Revisit if M11 GPS stretch makes PostGIS worth it.
