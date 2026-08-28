# Phase 4 — Web app completion + Android wrap

**Status:** Complete. Finalized 2026-08-28; superseded the placeholder
`phase4_*` modules committed during the W1–W8 branch merges.
**Outcome:** see [phase4-completion.md](./phase4-completion.md) for what
shipped, the regression results, the defects found, and the known limitations.
**Source of truth:** `Rydr_Phase4_Plan.docx` (Jun 6 – Aug 29, 2026).
**Class:** Core.

---

## 1. Why this document exists

The Phase 4 plan document explicitly says (§7, closing note) that it defines
the project *fresh from the problem statement* rather than assuming what is
already complete, and that "Week 1's audit is where the team reconciles this
plan with actual current progress."

This is that reconciliation.

## 2. Audit result — what actually shipped

Phase 3 (M1–M9) delivered a working end-to-end application. The following are
real, wired into `app/main.py`, and exercised by the frontend:

| Surface | Endpoints | State |
|---|---|---|
| Auth | `POST /api/auth/{signup,login}` | Working — JWT, bcrypt |
| Users | `/api/users/me`, `/me/bike`, `/me/stats`, `/{id}` | Working |
| Follow graph | `/{id}/follow`, `/{id}/followers`, `/{id}/following` | Working (M6) |
| Destinations | list+filter, create, detail, media, cost-estimate | Working (M1, M2) |
| Ratings/reviews | `/{id}/ratings` GET+POST | Working (M4) |
| Tags | `GET /api/tags` | Working |
| Ride plans | create, feed, mine, detail, update, delete, start, complete | Working (M3) |
| Participation | join, leave, participants, captain approve/reject | Working (M3) |
| Ride logs | create, detail, patch, media sign + attach + delete | Working (M4) |
| Chat | groups, messages GET/POST, message delete | Working (M5) — **REST only** |
| Badges | catalog, `/me`, `/users/{id}` + award engine | Working (M8) |

### 2.1 The W1–W8 commits are placeholders

Fifteen `phase4_*` modules were added across the W1–W8 branch merges. Every
one is a 5–14 line file of type aliases and constant dicts, and **none is
imported by any other module**:

```
backend/app/phase4_{foundation,destination_filters,review_ride_log_rules,
                    social_feed_payload,leaderboard,participation,
                    quality_targets,release}.py                    ~71 lines
backend/app/integrations/phase4_{maps,media,share_cards,gamification,
                    realtime,moderation,staging,platform}.py       ~47 lines
frontend/src/lib/phase4{Tokens,DestinationViews,ReviewMedia,
                    SocialShare,Gamification,Chat,MobileLayout,
                    MobileRelease}.ts                              8 files
```

They are removed in this phase and replaced by real implementations. They are
recorded here so the git history reads honestly: those weeks produced scope
notes, not shipped features.

## 3. Real Phase 4 gap

| Wk | Deliverable | Prior state | This phase |
|----|---|---|---|
| W2 | Map browsing, pins, clustering, route preview, static thumbnails | none | build |
| W3 | Video upload + thumbnail generation | image-only | extend |
| W4 | Social feed: posts, likes, comments | none (`Discussion` model unrouted) | build |
| W4 | Ride-summary endpoint for cards | none | build |
| W4 | Shareable ride / achievement cards | none | build |
| W5 | Rider leaderboard | none | build |
| W5 | "Most-ridden this month" destination leaderboard | none | build |
| W5 | In-app notifications | none | build |
| W5 | Personal stats dashboard (streaks, weekly/monthly) | basic `/me/stats` | extend |
| W6 | WebSocket chat | REST polling | replace |
| W6 | Ride capacity + waitlist | `max_riders` column unused | enforce |
| W7 | Moderation / report-content + admin view | none | build |
| W7 | Search/filter DB indexes | partial | extend |
| W7 | API test pass | no tests directory | build |
| W8 | Dockerized app services + staging + monitoring | Postgres service only | build |
| W9–11 | Capacitor Android shell, camera, FCM, AAB | none | scaffold |

## 4. Decisions taken at reconciliation

These four were open in the plan document and are now settled.

### 4.1 Maps — Leaflet/OSM now, Mapbox-ready

Plan §1.6 names Mapbox primary with "OpenStreetMap tiles + Leaflet.js + OSRM,
kept in reserve if Mapbox's free tier becomes a cost constraint."

We invert the default. All map and routing work goes behind a provider
interface (`services/maps/`), with **OSM/Leaflet/OSRM as the shipped
implementation** and a documented Mapbox adapter that activates when
`MAPBOX_TOKEN` is set. Rationale: no account, no key, no usage ceiling, and
the plan's own §7 risk entry about Mapbox quota disappears. The interface
means switching later is a config change, not a rewrite.

### 4.2 Share cards — server-composed SVG, client rasterization

Backend composes the card as SVG (`services/share_cards.py`); the client
rasterizes to PNG via Canvas for download and for the native share sheet.
Zero new backend imaging dependencies, and the SVG is directly embeddable in
the feed.

### 4.3 Tests — pytest + httpx

The repo had no automated tests; every prior milestone shipped a curl smoke
matrix instead. W7's "basic API test pass" and the Aug 22 freeze both need
something re-runnable, so `pytest`, `pytest-asyncio` and `httpx` are added as
the first test dependencies in the project.

### 4.4 Android — scaffold and document, do not build here

The development machine has Java and Node but no Android SDK, no Gradle, no
adb, and there is no Play Console account. W9–W11 therefore deliver the
Capacitor project, static-export configuration, native plugin wiring, icon and
splash assets, and a verified release checklist — everything required for the
build to be produced in Android Studio. The emulator run, the signed AAB and
the Play Console internal track are handed off, not claimed.

### 4.5 Static export — query-parameter routes

Capacitor needs `output: "export"`. Next 16 refuses dynamic route segments
without `generateStaticParams`, and Rydr's dynamic segments are all
user-generated IDs with no build-time list. The five affected routes move to
query parameters (`/destinations/detail?id=…`), giving one route shape that
exports cleanly and behaves identically in the browser and in the webview.

## 5. New dependencies

Surfaced per the project's standing rule that no dependency lands without
review.

| Dependency | Where | Why |
|---|---|---|
| `pytest`, `pytest-asyncio`, `httpx` | backend, dev | §4.3 |
| `leaflet`, `react-leaflet`, `leaflet.markercluster` | frontend | §4.1 |
| `@capacitor/{core,cli,android,camera,push-notifications}` | frontend | W9–W10 |

No new database, no new hosted service, no new account. OSRM is consumed via
its public demo endpoint in development and is configurable to a self-hosted
instance for staging.

## 6. Commit convention for this phase

One commit per task, no batching. Each commit message states what changed and
why, and names the verification performed. Nothing is pushed; the phase lands
as local history.
