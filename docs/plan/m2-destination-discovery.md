# M2 — Destination discovery

**Status:** Stub. Detailed plan TBD — written before M1 completes.
**Class:** Core.
**Effort estimate:** ~1.5 weeks.
**Task ID:** #10 (pending).

---

## Goal

Deliver the core discovery loop: user filters destinations by vibe, radius, vehicle fit, budget → sees ranked list → opens detail with map, photos, cost, tips, recent ride activity.

See `PHASE3_PLAN.md §4.1` item 2-3 and `§6 M2` for exit criteria.

## Depends on

- **M1** — `destinations`, `tags`, `destination_tags`, `destination_media`, `ratings` tables exist.
- **Task #2** — Mapbox public token in `frontend/.env.local`.
- **Task #6** — Real destination research (10–15 entries with photos) replacing the 5 placeholders from M1.

## External dependencies (to be approved)

- **Mapbox GL JS** (frontend npm package) — map rendering on destination detail. Free tier: 50k loads/mo.
- **No new backend packages** — Haversine distance is plain SQL.

## Scope — backend-first

### Backend (safe to build without UX discussion)

- `GET /api/destinations` — list with filters:
  - `tags[]` — filter by vibe tag slugs
  - `vehicle_fit[]` — filter by vehicle-fit tag slugs
  - `radius_km` + user's home lat/lng (from token) — Haversine
  - `max_budget` — INR band filter on combined food + entry
  - `q` — simple text search on name + region (tsvector if warranted)
  - sort: rating / distance / popularity
- `GET /api/destinations/{id}` — detail with embedded tags, media, avg rating, review count, recent ride_logs count
- `GET /api/destinations/{id}/media` — paginated media
- `POST /api/destinations` — submit new destination (auth required)
- Cost-calc service — fuel cost from bike mileage × distance × fuel price constant; food + entry from destination

### Frontend — DEFERRED pending UX discussion

Per `feedback_ui_ux_separate_track`: discovery page UI, filter UX, detail page layout, map integration, and destination submission flow all wait for a separate design session. Scaffolding for the API client + types can land alongside backend work.

## Data model changes

None beyond M1. All tables already exist.

## Key decisions to make in detailed plan

- **Cost calculator formula** — fuel price constant (₹100/L default?), use bike's mileage_kmpl × 2 × distance_km for round-trip, add food/entry from destination, output range (±20%)
- **Sort algorithm** — fixed weighted score (rating × 0.5 + popularity × 0.3 + recency × 0.2) or user-toggleable?
- **"Riders who went recently"** — how many, what time window, privacy model (show names or anonymous counts)
- **New-destination submission** — moderation gate? Auto-publish with "pending review" flag? Phase 3 has no admin tool
- **Image hosting** — M2 media on submission uses Cloudinary (pre-M4) or URL-only?

## Open questions before detailed plan

1. Is Task #6 (real destination research) ready when M2 starts?
2. Is Mapbox token (Task #2) set up?
3. UX discussion scheduled — when?

## Exit criteria (from PHASE3_PLAN.md)

User can filter destinations by tag + radius + vehicle + budget, see a ranked list, and open a detail page with a map.

Detailed plan to be written when M1 ships.
