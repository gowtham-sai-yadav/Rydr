# Phase 4 — completion record

**Date:** 2026-08-28. Corresponds to the plan's W12 code freeze (Aug 22) and
the report week (Aug 23–29).
**Companion documents:** [phase4-web-and-android.md](./phase4-web-and-android.md)
(the Week 1 reconciliation) and
[phase4-android-release.md](./phase4-android-release.md) (the W11 handoff).

---

## 1. What shipped

| Wk | Deliverable | State |
|----|---|---|
| W2 | Map browsing, pins, clustering, route preview | ✅ OSM/Leaflet, Mapbox behind a token |
| W2 | Geocoding, destination pins by viewport | ✅ |
| W3 | Video support + thumbnail generation | ✅ Cloudinary URL derivation |
| W3 | CDN delivery across devices | ✅ `f_auto` format negotiation |
| W4 | Social feed: posts, likes, comments | ✅ 10 endpoints + UI |
| W4 | Ride-summary endpoint | ✅ |
| W4 | Shareable ride + achievement cards | ✅ server SVG, client PNG export |
| W5 | Rider leaderboard | ✅ |
| W5 | "Most-ridden this month" destinations | ✅ |
| W5 | In-app notifications | ✅ 5 endpoints, 8 trigger points |
| W5 | Personal stats dashboard | ✅ distance, streaks, personal bests |
| W6 | Real-time chat | ✅ WebSocket, REST fallback retained |
| W6 | Ride capacity + waitlist | ✅ FIFO, auto-promotion |
| W7 | Moderation / admin reporting | ✅ queue + resolve + reporter notification |
| W7 | Search/filter DB indexes | ✅ 11, each measured |
| W7 | API test pass | ✅ 89 tests |
| W8 | Dockerised services | ✅ backend + frontend + db |
| W8 | Staging deploy configuration | ✅ compose + env template |
| W8 | Monitoring / error tracking | ⚠️ structured JSON logs + health probes; Sentry not wired (needs an account) |
| W9 | Mobile-responsive pass | ✅ audited at Pixel 7 |
| W9 | Capacitor Android shell | ✅ scaffolded, never compiled (no SDK here) |
| W9 | Static export confirmed | ✅ 22 routes |
| W10 | Native camera capture | ✅ code complete |
| W10 | Push notifications | ⚠️ client complete; no Firebase project, so nothing is delivered |
| W11 | Signed AAB, Play internal track | ❌ handed off — see the release checklist |

The three items that are not green are all blocked on an account or an SDK
this project does not have, and each is documented where someone would look
for it rather than only here.

## 2. Regression results

Run on 2026-08-28 against the local Postgres 15 container.

| Check | Result |
|---|---|
| Backend test suite | 89 passed |
| Migration chain, empty database → head | 13 revisions applied |
| Migration chain, head → base | 12 reverted, then the M1 destructive-downgrade guard refuses (by design) |
| Frontend typecheck | clean |
| Frontend build, `standalone` | 19 routes |
| Frontend build, `export` | 22 HTML files |
| `docker compose -f docker-compose.staging.yml up --build` | all three services healthy |
| 19 API endpoints through the containers | correct status on every one, including 403 on the admin route for a non-admin |
| Browser walkthrough, desktop 1280px | signup + 6 pages, no console errors |
| Browser walkthrough, Pixel 7 | signup + 6 pages, no overflow, no console errors |

## 3. Defects found and fixed during the phase

Recorded because several were latent before Phase 4 and would have surfaced in
a demo or a deploy.

| # | Defect | Found by |
|---|---|---|
| 1 | M8 migration re-declared tables M1 already created — `alembic upgrade head` failed on any fresh database | reading the migration chain |
| 2 | `safe_notify` swallowed the exception but left the session needing rollback, so a notification failure still broke the caller's commit | writing a deliberately-bad-payload test |
| 3 | Chat WebSocket held an `idle in transaction` session for the socket's lifetime, blocking VACUUM and DDL | an Alembic migration hung behind the lock |
| 4 | `alembic/env.py` ignored `DATABASE_URL` and always used the hardcoded dev URL — would have migrated the wrong database on staging | the test database stayed empty while the command reported success |
| 5 | Chat WebSocket built its own session instead of using `Depends(get_db)`, bypassing dependency overrides | the socket was untestable |
| 6 | `EARTH_RADIUS_KM` declared twice with different values — leaderboard and destination list disagreed about the same journey | reusing the constant |
| 7 | `users.is_admin` existed and was enforced but was never in `UserOut`, so no client could know | the moderation nav link never appeared |
| 8 | Next's standalone server bound to the container IP, not `0.0.0.0` — healthcheck permanently unhealthy against a working site | container reported unhealthy |
| 9 | Share card: title overflowed into the map panel; stars collided with the rider count; duration read "564h 23m" | rendering the card to PNG and looking at it |
| 10 | `/users/me/stats`' `rides_completed` counted only captained rides, so a rider who had joined thirty and led none saw zero | widening the endpoint |
| 11 | `code-review-graph` hooks called a binary that was never installed, erroring on every tool call | user asked about the noise |

## 4. Known limitations

Stated plainly so they are not mistaken for oversights.

- **Distance is estimated, not measured.** There is no GPS track. Every
  distance is the great-circle from the rider's home to the destination,
  doubled, and is labelled as an estimate everywhere it appears. Riders with no
  home location contribute zero distance but still appear on leaderboards with
  their ride count.
- **Chat is single-worker.** The WebSocket registry is in process memory, so the
  deployment runs one uvicorn worker. Scaling out needs a Redis pub-sub layer;
  `services/ws_manager.broadcast` is the only function that would change.
- **Push delivers nothing yet.** No Firebase project. The in-app feed is
  unaffected.
- **Sentry is not wired.** Structured JSON logs with request-id correlation and
  two health probes are in place; `app/observability.py` is where an SDK would
  initialise.
- **No in-app account deletion.** Play requires a deletion path before
  production release. Flagged in the release checklist.
- **The Android project has never been compiled.** No SDK on the development
  machine. Expect small Gradle fixes on the first build.
- **Mapbox adapter is untested against the live service.** Written to the
  documented API shapes; no token was issued. The OSM path is the one with
  live coverage.

## 5. Statistics

- 78 API routes
- 89 automated tests
- 13 migrations
- 27 database tables
- 22 frontend routes
- 34 commits in this phase, one per task
