# M4 — Post-ride capture + Cloudinary integration

**Status:** Stub. Detailed plan TBD.
**Class:** Core. **This is the data flywheel — non-negotiable for Phase 3.**
**Effort estimate:** ~1 week.
**Task ID:** #12 (pending).

---

## Goal

Close the flywheel. When a `RidePlan` transitions to `completed`, the rider is prompted to create a `RideLog` with: photos/videos, destination rating (1–5 + review text), actual cost, road condition, recommend y/n, free-text notes. Media uploads via Cloudinary. The rating updates the destination's denormalized `avg_rating` and `rating_count`. Media optionally links back to the destination for future discovery.

See `PHASE3_PLAN.md §6 M4` for exit criteria.

## Depends on

- **M1** — `ride_logs`, `ride_media`, `ratings`, `destination_media` tables
- **M3** — users can complete a ride plan
- **Task #8** — Cloudinary account + API keys

## External dependencies (to be approved)

- **Cloudinary** — media upload + storage + CDN delivery. Free tier: 25GB storage, 25GB bandwidth/mo.
- **`cloudinary` Python package** (backend) — for generating signed upload URLs. Alternative: manual HMAC signing (zero deps but more code). Decide in detailed plan.
- **`next-cloudinary`** (frontend, if chosen) — React component for uploads. Alternative: raw fetch to Cloudinary's direct-upload endpoint.

## Scope

### Backend

- `POST /api/ride-plans/{id}/complete` — transition plan → completed, create associated `RideLog`
- `POST /api/ride-logs/{id}/media/sign` — return a signed Cloudinary upload URL (server holds API secret; browser uploads direct)
- `POST /api/ride-logs/{id}/media` — confirm media record after direct upload
- `POST /api/ride-logs/{id}/rating` — submit destination rating + review (upserts `ratings` by unique constraint)
- `PATCH /api/ride-logs/{id}` — update feedback (cost, road_condition, recommended, notes)
- **Destination denorm update** — when rating inserted/updated, recompute `destinations.avg_rating` and `rating_count` (single UPDATE query)
- **Destination media link** — on media upload with `link_to_destination=true`, create a `destination_media` row pointing to the same URL

### Frontend — DEFERRED pending UX discussion

Post-ride capture form (photo picker, rating stars, textarea, cost input, submit flow). Critical UX path — needs dedicated design time.

## Data model changes

None beyond M1.

## Key decisions to make in detailed plan

- **Cloudinary: direct browser upload** (frontend uploads to Cloudinary with signature, then confirms URL with backend — reduces backend bandwidth) vs. **proxy via backend** (backend receives file, uploads to Cloudinary — more control). Recommend direct upload.
- **Media size limits** — Cloudinary free tier is 10MB/image, 100MB/video. Enforce in signing.
- **Video support** — M4 photos only? Or wire video too? Recommend photos first, video as flag.
- **Rating updates** — user can edit/delete their rating? Recommend: yes (upsert + delete).
- **Denorm update strategy** — recompute on write (single query, slight lag on concurrent writes) or event-driven (background task, more moving parts). Recommend on-write.
- **"Link media to destination" default** — on by default, user can opt out? Or off by default, user opts in? Recommend on-by-default (flywheel).
- **Ride auto-complete** — does the system ever auto-complete a plan past its planned end time, or is it always manual? Recommend manual for Phase 3; auto-complete deferred.

## Open questions before detailed plan

1. Cloudinary account ready (Task #8)?
2. Direct-upload vs. proxy-upload preference?
3. Video support in M4 or later?
4. UX discussion for the capture flow scheduled?

## Exit criteria (from PHASE3_PLAN.md)

User completes a ride, uploads photos + feedback + rating, destination page reflects the new data (updated avg_rating, new media in gallery).

Detailed plan to be written when M3 ships.
