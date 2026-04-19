# M5 — Real ride chat (replace MOCK_MESSAGES)

**Status:** Stub. Detailed plan TBD.
**Class:** Core.
**Effort estimate:** ~3–4 days.
**Task ID:** #13 (pending).

---

## Goal

Replace the hardcoded `MOCK_MESSAGES` in `backend/app/routers/chat.py` with a real chat system backed by the `chat_messages` table. Async messaging (polling from the frontend every 5–10s during active chat view — no websockets in MVP). Chat is per-ride, accessible only to the RidePlan's approved participants and captain.

See `PHASE3_PLAN.md §6 M5` for exit criteria.

## Depends on

- **M1** — `chat_messages` table exists
- **M3** — `ride_plans` has participants (for auth check)

## External dependencies

**None.** No new packages. Polling over plain REST.

## Scope

### Backend

- `GET /api/chat/groups` — groups user is a member of (already exists, refactor to use `ride_plan_id`)
- `GET /api/chat/groups/{id}/messages?since=<ts>&limit=50` — paginated, supports polling
- `POST /api/chat/groups/{id}/messages` — send message, auth check enforces user is captain or approved participant
- `DELETE /api/chat/messages/{id}` — author or captain can delete (soft or hard?)

### Frontend — DEFERRED pending UX discussion

Chat room page needs polling integration + send input + delete UI. Existing static mock-render stays until UX lands.

## Data model changes

None beyond M1.

## Key decisions to make in detailed plan

- **Poll interval** — 5s (snappy, more load) vs. 10s (chill). Recommend 7s with exponential back-off on tab blur.
- **Authorization model** — strict (only approved participants + captain) vs. relaxed (also pending participants, so they feel included). Recommend strict; pending users see "join first to chat".
- **Message edit** — yes/no. Recommend no for Phase 3 (simpler). Delete yes.
- **Read receipts** — Phase 4+.
- **Typing indicators** — Phase 4+ (requires real-time).
- **Max message length** — 2000 chars. Enforce in Pydantic + DB constraint.
- **Rate limiting** — basic in M5 (e.g. 10 messages / 10s per user per group) to deter spam, or deferred to M9 auth hardening?
- **Attachments** — photos? Link out? M4 handles photos but chat hasn't been a media surface. Recommend no attachments in M5; text only.

## Open questions before detailed plan

1. Attachments in chat — yes/no/later?
2. Rate limiting in M5 or M9?
3. UX discussion for chat room UI scheduled?

## Exit criteria (from PHASE3_PLAN.md)

Users in a ride chat can send messages; others see them on next poll. No MOCK_MESSAGES remain.

Detailed plan to be written when M4 ships.
