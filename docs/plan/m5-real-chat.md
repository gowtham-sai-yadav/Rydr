# M5 — Real ride chat (replace MOCK_MESSAGES)

**Status:** Finalized 2026-05-28. Backend-first; frontend chat pages will break on the canonical message shape and need a UX-track update (same pattern as `/rides/create` after M3).
**Class:** Core.
**Effort estimate:** ~3–4 days.
**Task ID:** #13.

---

## Goal

Replace the hardcoded `MOCK_MESSAGES` in `backend/app/routers/chat.py` with a real, persisted chat system backed by the M1 `chat_messages` table. Async messaging via REST polling — no websockets in MVP. Chat is strictly private to a `RidePlan`'s captain plus approved participants.

Exit criterion (PHASE3_PLAN §6 M5):

> Users in a ride chat can send messages; others see them on next poll. No `MOCK_MESSAGES` remain.

## Depends on

- **M1** — `chat_groups`, `chat_messages` tables ✅
- **M3** — `RidePlanParticipant` with `status=approved` is the membership signal; group rides auto-create a `ChatGroup` at plan-create time ✅

## External dependencies

**None.** No new pip packages, no env vars, no migrations. The M1 schema is sufficient.

## What's actually in the code today (verified, not assumed)

I read the source before writing this plan. Findings:

1. `backend/app/routers/chat.py` lines 73–86: `GET /api/chat/groups` already queries the DB, but the participant subquery has **no status filter** — pending/rejected/left users currently see groups in their list. **Real bug** that M5 fixes.
2. `chat.py` lines 90–100: `GET /api/chat/groups/{id}/messages` returns the hardcoded 2024-dated `MOCK_MESSAGES` array; the user/group is never even checked for membership. **Full replace.**
3. `backend/app/schemas/chat.py` lines 19–32: `ChatMessageOut` uses the mock shape (`id: str`, `sender_name`, `sender_avatar`, `content`, `timestamp: str`, `is_mine: bool`). This is the public contract right now.
4. `frontend/src/app/(main)/chat/[groupId]/page.tsx`: the chat-room UI reads `msg.sender_name.charAt(0)`, `msg.content`, `msg.timestamp`, `msg.is_mine` directly. Replacing the contract with a canonical shape **will break this page until the UX-track updates it.** Same trade-off as `/rides/create` after M3.
5. `chat/[groupId]/page.tsx` lines 23–37: `handleSend` only mutates local state — it never POSTs to the backend. So "sending" is already a non-functional demo; M5 doesn't regress that.
6. `chat/page.tsx`: only reads `group.id` and `group.name` from the list, so adding fields to `ChatGroupOut` won't break it at runtime.

## Decisions resolved (was open in stub)

Each row is a **decision + the reason for it**, not an arbitrary preference.

| Question | Decision | Reasoning |
|---|---|---|
| Poll cadence | **Not a backend concern.** `GET /messages` accepts `since=<ISO ts>` and the frontend picks its own interval (5s / 7s / 10s). | Decoupling — the API doesn't need to know how the client polls. Stub's 7s is a UI suggestion only. |
| Authorization | **Strict** — captain OR participant with `status=approved`. Pending / rejected / left → 404 (not 403). | 404 doesn't leak "this chat exists, you just can't see it" to non-members. Chat groups are private per spec, unlike ratings which are explicitly public. |
| Message edit | **No** for M5. | Stub recommendation; complexity vs value is bad in MVP. M9 can revisit. |
| Message delete | **Yes** — author OR captain, hard delete (no soft-delete column). | Stub spec; no moderation tooling planned for Phase 3 (admin can manually DB-edit). Soft delete would need a migration + display gates everywhere — not worth M5 effort. |
| Max body length | **2000 chars**, enforced in Pydantic `Field(min_length=1, max_length=2000)` + a `strip()` validator that rejects whitespace-only. **No DB constraint.** | DB column is `Text` (unlimited); Pydantic at the API boundary is sufficient and avoids a migration. M9 owns DB-level hardening. |
| Rate limiting | **Defer to M9.** Consistent with M2's submit-cap deferral and PHASE3 §4.1 item 10 ("rate limiting basics" in M9). | Same milestone hygiene rule we've followed since M2 — don't pre-empt M9. |
| Attachments | **No** — text only. | Stub recommendation; media uploads stay on the ride-log path (M4). Adding attachments to chat would duplicate the Cloudinary signing flow without adding flywheel value. |
| Read receipts / typing | **Out** — Phase 4+. | Per stub. Both require websockets / per-user-state — way beyond Phase 3 scope. |
| Polling endpoint shape | `GET /messages?since=<iso ts>&limit=50`. Strictly `created_at > since`. Without `since`, returns the **most recent** `limit` messages, ordered chronologically (ASC) so the client can append + scroll-to-bottom. | One endpoint handles both initial load (no `since`) and incremental polling (`since=lastSeen`). Chronological order means client doesn't reverse. |
| Tiebreaker | `created_at ASC, id ASC` | M2 audit pattern — stable ordering across pages so a burst of messages with identical timestamps doesn't shuffle. |
| Limit cap | default 50, max 200 | 50 covers 99% of polls; 200 hedges against a long-offline-then-poll burst. |
| List groups ordering | `ride_plans.planned_date DESC, chat_groups.id ASC` — most recent / upcoming ride first. | "Last message" sorting (WhatsApp style) needs a `MAX(chat_messages.created_at)` aggregate per group — extra cost for marginal UX gain in Phase 3 with ~5 rides per user. Defer "last message" sorting to M9/UX. |
| List groups pagination | `page, limit` like every other M2/M3 list endpoint. default 50, max 100. | Consistency — every paginated list endpoint in the project takes `page/limit`. |
| New `GET /chat/groups/{id}` detail endpoint | **Add it** — returns the group with embedded ride summary (title, planned_date, status, participant_count, destination). | The chat-room URL is `/chat/{groupId}`; without this, the frontend must fetch all groups to find the matching one OR pass `ride_plan_id` through a query string. One round-trip beats two for every page load. |
| `is_mine` field | **Drop it.** The new `ChatMessageOut` returns `author: UserBrief`; the client derives `is_mine` via `author.id === currentUser.id`. | Server shouldn't bake caller-relative state into the response — same value used by 10 caching layers means stale `is_mine` for everyone but the original caller. Standard client-side derivation. |
| `author: UserBrief` embedded | **Always** — `selectinload(ChatMessage.author)` on every list / detail / create response. | Avoids N+1; UserBrief is 3 fields so payload bloat is negligible vs separate `/users/{id}` round-trips. |
| Tests | Skip pytest for M5. Verify by curl. | M9 is the testing milestone — same pattern as M1–M4. |

## Schema shape — old vs new

**Current `ChatMessageOut` (mock-aligned, dropped):**

```python
{ "id": str, "sender_name": str, "sender_avatar": Optional[str],
  "content": str, "timestamp": str, "is_mine": bool }
```

**New canonical `ChatMessageOut`:**

```python
{ "id": UUID, "chat_group_id": UUID, "body": str,
  "created_at": datetime, "author": UserBrief }   # UserBrief = {id, name, avatar_url}
```

**Why the rename:** `content → body` matches the SQLAlchemy column name (`ChatMessage.body`). `timestamp → created_at` matches the DB column. `sender_name/avatar → author: UserBrief` aligns with how every other endpoint in the project surfaces a user reference (M2 ratings, M3 participants, M4 ride logs). Consistency is more valuable than back-compat with a non-functional mock.

**Frontend consequence:** `chat/[groupId]/page.tsx` will throw at runtime on `msg.sender_name.charAt(0)` because `sender_name` no longer exists. This is acknowledged debt — the page already had broken send semantics, so the UX track was going to rewrite it regardless. Same as the `/rides/create` page after M3.

## Scope — backend

### Updated router: `routers/chat.py`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/chat/groups` | required | List groups user can access (captain OR `status=approved` participant); paginated; ride summary embedded |
| GET | `/api/chat/groups/{id}` | required | Detail with ride summary (NEW endpoint — UI header) |
| GET | `/api/chat/groups/{id}/messages` | required | `since=<iso ts>` + `limit ≤ 200`; ASC chronological |
| POST | `/api/chat/groups/{id}/messages` | required | Send (body 1–2000 chars, trimmed) |
| DELETE | `/api/chat/messages/{id}` | required | Author OR captain only — hard delete |

### Validation gates (M2/M3/M4 audit patterns)

- Body: `Field(min_length=1, max_length=2000)` + `@field_validator` that strips whitespace and rejects empty post-strip.
- `since`: optional ISO datetime; if absent, returns last `limit` messages in chronological order.
- All paginated list queries end in `.id.asc()` tiebreaker (M2 audit #4 pattern).
- `eager_load(ChatMessage.author)` on every list / single-message response (M2 audit #18 pattern).
- 404 on non-member access (don't leak); 403 on known-member-but-wrong-action (delete someone else's message as a non-captain).
- Solo rides have no ChatGroup (M3 decision) → all four endpoints return 404 for solo `group_id` — no special-case code needed.

### Authorization model

```
_load_group_or_404(db, group_id, user):
    group = db.query(ChatGroup).options(selectinload(ChatGroup.ride_plan)).get(group_id)
    if not group:
        raise 404
    ride = group.ride_plan
    if ride.captain_id == user.id:
        return group, "captain"
    is_approved = db.query(RidePlanParticipant.id).filter(
        ride_plan_id == ride.id,
        user_id == user.id,
        status == approved,
    ).first()
    if not is_approved:
        raise 404                            # don't leak existence
    return group, "participant"
```

Used by all four group-scoped endpoints. The DELETE handler does an extra check after this: `role == "captain" OR message.author_id == user.id` → else 403.

### Updated schemas (`schemas/chat.py`)

- `ChatGroupOut` extended: `id, ride_plan_id, name, ride: RideSummary` (where `RideSummary` is a slim shape — title, planned_date, status, participant_count, destination_name — built inline; importing the full `RidePlanOut` from `schemas/ride` would cycle, so a local shape).
- `ChatGroupListResponse`: standard `{groups, total, page, limit}`.
- `ChatMessageOut`: canonical shape above.
- `ChatMessageListResponse`: `{messages, has_more}` — drop `total` because polling-style endpoints don't need a row count for every poll; `has_more = len(rows) == limit` is enough hint for client-side scroll.
- `ChatMessageCreate`: `{body: str}` with validators.

The old `ChatMessageOut` mock shape gets deleted outright — no need to keep it around since the frontend is broken either way.

### Frontend api.ts updates

- `getChatGroups()` → typed return aligned to new `ChatGroupListResponse`.
- New: `getChatGroup(id)` for the detail endpoint.
- `getChatMessages(groupId, since?, limit?)` — accept the poll params.
- New: `sendChatMessage(groupId, body)`.
- New: `deleteChatMessage(messageId)`.
- All return `unknown` per the M2 typing-deferred convention; M9 tightens.

## Acknowledged frontend breakage

- `frontend/src/app/(main)/chat/[groupId]/page.tsx` will crash at runtime once it hits the new canonical message shape. It needs the UX-track rewrite to:
  - Poll via `getChatMessages(groupId, sinceTimestamp)` every 5–10 s
  - Wire `handleSend` to actually POST via `sendChatMessage`
  - Render `msg.author.name`, `msg.body`, `msg.created_at`, derive `is_mine`
- `chat/page.tsx` keeps working — it only reads `group.id` + `group.name`, both still present.

This break is intentional and documented; same playbook as M3's break on `/rides/create`. No partial fix — UX track does it cleanly when it lands.

## Out of scope (deferred — same buckets as previous milestones)

- Auth hardening, CORS env, frontend type tightening → M9
- Rate limiting / message-flood protection → M9
- Read receipts, typing indicators, websockets → Phase 4+
- Attachments (photos in chat) → not planned (use ride-log media)
- Backward-fill `before=<ts>` history paging → defer to M9 or UX-track if needed
- "Last message" sorting on groups list → defer if engagement signal demands it
- Notifications on new message → M6 (`# TODO M6:` marker in handler)

## Verification plan (no pytest in M5)

After implementation, with the existing seeded users (alex, sam, jordan) and the M4 test ride still in DB:

1. Backend imports clean; uvicorn starts.
2. Curl smoke matrix:
   - `GET /api/chat/groups` as alex (captain of M4 test ride) → group present with embedded ride summary
   - `GET /api/chat/groups` as jordan (rejected from M4 test ride) → group **NOT** present (status filter fixes the pre-M5 bug)
   - `GET /api/chat/groups` as sam (approved on M4 test ride) → group present
   - `GET /api/chat/groups/{id}` as sam → 200 with ride summary
   - `GET /api/chat/groups/{id}` as jordan → 404 (not 403)
   - `POST /api/chat/groups/{id}/messages {body: "hey"}` as sam → 201; response embeds `author: {name: "Sam Cruz", ...}`
   - `POST` with `body: ""` → 422
   - `POST` with `body: "   "` (whitespace-only) → 422
   - `POST` with body > 2000 chars → 422
   - `POST` as jordan (non-member) → 404
   - `GET /api/chat/groups/{id}/messages` as sam (no `since`) → returns the message just sent, chronological
   - `GET /api/chat/groups/{id}/messages?since=<ts of sam's message>` → empty list (strict >)
   - Sam posts another → `GET /messages?since=<earlier ts>` returns only the newest
   - `DELETE /api/chat/messages/{id}` as sam (own message) → 204
   - Sam posts again; `DELETE /api/chat/messages/{id}` as alex (captain) → 204
   - Sam posts again; `DELETE /api/chat/messages/{id}` as jordan (non-member) → 404
   - Alex posts; `DELETE /api/chat/messages/{id}` as sam (not author, not captain) → 403
   - Solo ride from earlier sessions has no chat_group → `GET /api/chat/groups/{solo_ride_chat_id}/...` is moot (no such id exists); verify the GET list for a solo-only rider returns empty
3. `MOCK_MESSAGES` constant deleted from `chat.py`; grep confirms zero references.

## Files touched

**Modified:**
- `backend/app/routers/chat.py` — full rewrite (5 endpoints, drop MOCK_MESSAGES, add membership gates)
- `backend/app/schemas/chat.py` — drop mock shape; add canonical message + group response types
- `frontend/src/lib/api.ts` — typed methods aligned to new payloads + add `sendChatMessage`, `deleteChatMessage`, `getChatGroup`

**Not modified:**
- Models (no schema change)
- Migrations (no schema change)
- Any other router
- The two frontend chat pages — they break and stay broken until UX track rewrites them

## Exit criteria (from PHASE3_PLAN.md)

> Users in a ride chat can send messages; others see them on next poll. No `MOCK_MESSAGES` remain.

Met when the curl matrix passes and `grep -r MOCK_MESSAGES backend/` returns zero hits.

## Frontend debt opened by M5

- `chat/[groupId]/page.tsx`: full rewrite needed — polling loop, real send, new render shape
- (Smaller) `chat/page.tsx`: optional enhancement to surface `ride.title` + `participant_count` from the new embedded ride summary

## Frontend debt closed by M5

None — backend-only milestone. The previously-mock chat became real but the consuming UI breaks until UX track lands.

## What I am explicitly NOT assuming

A short list of things I checked rather than guessed:

- ✅ `ChatGroup.ride_plan_id` is `unique=True, nullable=False` — confirmed in `models/chat.py:23–28`.
- ✅ `ChatMessage` has `chat_group_id`, `author_id`, `body`, `created_at` + index on `(chat_group_id, created_at)` — confirmed in `models/chat.py:39–57`.
- ✅ The existing groups query does NOT filter by participant status — confirmed in `routers/chat.py:73–86`. M5 fixes this.
- ✅ The existing messages query returns `MOCK_MESSAGES` regardless of group / user — confirmed in `routers/chat.py:96–100`.
- ✅ `M3 routers/rides.py:212–215` creates ChatGroup *only* for `visibility=group` — so solo rides have no chat_group, which means every chat endpoint naturally 404s for solo rides without special-casing.
- ✅ Frontend chat-room page reads `sender_name`, `content`, `timestamp`, `is_mine` directly — confirmed in `chat/[groupId]/page.tsx:60,72,75,67`. Canonical shape breaks the page.
- ✅ Frontend chat-room `handleSend` never POSTs — only `setMessages([...])` — confirmed in `chat/[groupId]/page.tsx:23–37`. Send is already non-functional pre-M5.
- ✅ Frontend `chat/page.tsx` reads only `group.id` + `group.name` — confirmed `chat/page.tsx:37,45`. Adding fields to `ChatGroupOut` is safe.

Anything not on this list is documented decision-with-reasoning, not assumption.

---

## Audit response — second pass (2026-05-24)

The M5 audit (`docs/review/phase3-m5-real-chat-audit.md`) raised 24 findings.
The triage and resolution:

### Landed in this PR (audit fixes)

| # | Fix | What changed |
|---|---|---|
| 2 | 204 no-content body parse | `request<T>` short-circuits on `res.status === 204 || Content-Length === '0'`; `deleteChatMessage` / `deleteRideMedia` returns `Promise<void>` instead of throwing on success. |
| 3 + 4 | Keyset cursors instead of timestamp polling | Dropped `since` param; added `after_id` (forward poll) and `before_id` (backward history). Server resolves the cursor via `(created_at, id)` tuple-compare so messages at identical microseconds are not silently dropped, and history past `limit` is now reachable. |
| 9 | Naive-datetime trap | Moot — no datetime query param remains after #3/#4. |
| 10 | Membership-leak via timing | `_load_group_or_404` collapsed to one SQL statement using `LEFT JOIN ride_plan_participants`; the "group exists, you're not a member" code path no longer needs an extra round-trip vs "group missing." Also a perf win. |
| 12 | Cancelled-ride chat is read-only | `send_message` + `delete_message` return 409 when `ride.status == cancelled`. Reads still work (post-mortem). |
| 14 | ChatGroup.name → ride.title | `_build_group_out` sources `ChatGroupOut.name` from `ride.title` so renaming a ride keeps the chat header in sync. The DB column stays vestigial; M9 may drop. |
| 15 | Dead `role` return | `_load_group_or_404` now returns bare `ChatGroup`; callers updated. |
| 18 | Duplicate `_approved_counts_for` | Extracted to `backend/app/services/ride_helpers.py`; both routers import. |
| 19 | `Optional[UserBrief]` on message author | Tightened to `UserBrief` (non-optional) — DB FK is `NOT NULL + CASCADE` so author always exists for live rows. |
| 24 | `commit-m2.sh` git hygiene | Deleted — backdate script served its purpose. |

### Deferred (with reason)

| # | Item | Why we're not doing it in M5 |
|---|---|---|
| 1 | `/chat/[groupId]/page.tsx` UI crash on canonical shape | Same agreed pattern as `/rides/create` after M3 — UX-track rewrites the page when a dedicated frontend pass starts. Documented in "Frontend debt opened by M5". |
| 5 | Rate limit + ETag + visibility pause | Consistent with all prior rate-limit deferrals to **M9** ("rate limiting basics" in PHASE3_PLAN §4.1 item 10). Polling cadence is a UI choice the frontend controls; visibility-pause is UX-track. |
| 6 | Idempotency key on send | No client retry logic exists yet; the column + partial-unique-index + handler dedupe is **M9** future-proofing landed alongside the retry implementation. |
| 7 | Soft delete | Plan originally chose hard delete (no moderation tooling planned for Phase 3, audit acknowledged). M9 can revisit if abuse signal emerges. Trade-off: viewer-side stale-row visibility until refresh. |
| 8 | DB `CheckConstraint` on body length | Pydantic covers the only writer (the API); DB-level defense-in-depth migration is **M9**. |
| 11 | Websocket migration | See "Future realtime architecture" section below; no code in M5. |
| 13 | XSS / unicode strip | Frontend renders chat via JSX text interpolation (safe). Documented rule: **no `dangerouslySetInnerHTML` in chat renderers**. Unicode-category strip is **M9**. |
| 16 | Unreachable null check | Defensive belt-and-braces; kept with explanatory comment. |
| 17 | Author cascade on user delete | No user-delete endpoint exists yet. When it lands (post-Phase 3), switch FK to `SET NULL` and make `author` optional then. |
| 20 | Last-message preview + unread count | UX surface, not M5 scope. Add when the UX track redesigns the `/chat` index. |
| 21 | If-Modified-Since short-circuit | Covered by #5; same milestone. |
| 22 | Typed `Promise<T>` in api.ts | **M9** repo-wide typing pass; doing it piecemeal per milestone is inconsistent with how M2/M3/M4 deferred. |
| 23 | UI send button doesn't hit API | Same as #1 — UX-track work. |

### Future realtime architecture (audit #11 documentation hook)

The M5 contract is intentionally pull-based; a future push-based push channel
would slot in as:

- **Cursor compatibility**: `after_id` is already an opaque message identifier; the same id can serve as `Last-Event-ID` for an SSE `EventSource`, or as a Redis Stream entry id for a Kafka-style fan-out. No client-side change.
- **Event envelope**: when realtime lands, wrap message payloads as `{type: "message.created" | "message.deleted", payload: ChatMessageOut}` so the client can demux a single event stream. Today's REST endpoints return the bare `ChatMessageOut` — the envelope is purely additive.
- **Pub/sub mechanism**: Postgres `LISTEN/NOTIFY` is the cheapest first step (no new infra) — emit on every commit in `send_message` / `delete_message`. Move to Redis Pub/Sub or a Kafka topic only when fan-out > ~100 subscribers per ride.
- **Soft delete (audit #7) becomes load-bearing then**: realtime needs tombstone events so viewers can drop stale rows from their local store. The same `deleted_at` migration enables both server-side tombstones and the SSE delete event.

That migration is **out of M5 scope** but is the natural landing surface for the realtime work.
