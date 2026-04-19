# M3 — Ride planning against destinations

**Status:** Stub. Detailed plan TBD — written before M2 completes.
**Class:** Core.
**Effort estimate:** ~1 week.
**Task ID:** #11 (pending).

---

## Goal

Rebuild the ride-planning flow around `destination_id`. Solo rides (single-user RidePlan) and group rides (captain + participants, approval) both target a specific Destination picked from M2's discovery. Replace the stubbed M1 `routers/rides.py` with a full implementation matching the new schema.

See `PHASE3_PLAN.md §6 M3` for exit criteria.

## Depends on

- **M1** — `ride_plans`, `ride_plan_participants` tables and relationships
- **M2** — destination discovery so users can pick a destination before creating a ride

## External dependencies (to be approved)

**None.** Pure backend + frontend refactor of existing flow.

## Scope

### Backend (safe to build without UX)

- `POST /api/ride-plans` — create a RidePlan for a destination
- `GET /api/ride-plans/feed` — upcoming public (group) rides, filterable by destination + region
- `GET /api/ride-plans/mine` — rides I captain or participate in
- `GET /api/ride-plans/{id}` — detail
- `PUT /api/ride-plans/{id}` — update (captain only)
- `DELETE /api/ride-plans/{id}` — cancel (captain only)
- `POST /api/ride-plans/{id}/join` — request to join
- `GET /api/ride-plans/{id}/participants` — captain view
- `PUT /api/ride-plans/{id}/participants/{user_id}` — approve/reject

**Note on URL path:** migrate from `/api/rides` to `/api/ride-plans` for clarity, or keep `/api/rides` and only rename internals. Decide in detailed plan.

### Frontend — DEFERRED pending UX discussion

All rides list / detail / create pages need redesign for the destination-first flow. Scaffolding (API client, types) can ship with backend.

## Data model changes

None beyond M1.

## Key decisions to make in detailed plan

- URL path: `/api/rides` (keep) vs. `/api/ride-plans` (rename to match entity)
- Can a user plan multiple rides to the same destination on the same day?
- `visibility=solo` — should it still create a `ChatGroup` or skip?
- Who can cancel a ride: captain only, or also participants can leave?
- When a captain cancels, do participants get a notification (stub M6)?

## Open questions before detailed plan

1. UX discussion for ride-create flow scheduled?
2. Any changes to the join/approval model? (Current PoC requires captain approval — keep or open-join?)

## Exit criteria (from PHASE3_PLAN.md)

User can plan solo or group ride targeting a destination; captain approval flow still works.

Detailed plan to be written when M2 ships.
