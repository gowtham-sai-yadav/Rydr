# Phase 3 / M5 — Real Ride Chat — Production Engineering Audit

**Branch:** `feat/implementation1`
**Base commit:** `dd82b6f` (post-M4)
**Audit date:** 2026-05-24
**Reviewer:** Production audit pass for the M5 chat PR

This is the production-readiness audit for the M5 PR that replaces the
`MOCK_MESSAGES` array in `backend/app/routers/chat.py` with real DB-backed
chat persistence and the canonical message shape. Each finding includes a
**"Fix required?"** verdict to help triage what truly blocks ship vs. what
can wait.

## Files in scope

**Staged in this PR:**

| File | Change |
|---|---|
| `backend/app/models/chat.py` | Adds `idx_chat_messages_group_time` (it was already in the M1 migration; model now declares it) |
| `backend/app/routers/chat.py` | Full rewrite — 5 endpoints, real DB queries, strict membership gating |
| `backend/app/schemas/chat.py` | Canonical shapes (`ChatGroupOut`, `ChatGroupRide`, `ChatMessageOut`, `ChatMessageListResponse`, `ChatMessageCreate`), drops mock shape |
| `docs/plan/m5-real-chat.md` | Finalized plan |
| `frontend/src/lib/api.ts` | 4 new client methods + one paginated; comments call out the broken chat page |

**Indirectly impacted (read for context):**
`backend/app/models/ride.py`, `backend/app/models/user.py`,
`backend/app/routers/rides.py`, `backend/app/schemas/user.py`,
`backend/app/dependencies.py`, `backend/app/database.py`,
`frontend/src/app/(main)/chat/[groupId]/page.tsx`,
`frontend/src/app/(main)/chat/page.tsx`,
`frontend/src/lib/types.ts`.

## Prior-audit deltas (M2/M3/M4 findings now resolved)

Quick sanity check — several prior findings have **already been fixed** and
do NOT need re-listing:

- `formatErrorDetail` is now in `frontend/src/lib/api.ts:5-23` → M2 audit #13/15 **resolved**.
- `ChatMessage.author_id` and `ChatGroup.ride_plan_id` cascades + unique index are correct.
- The chat router properly uses `selectinload`/`joinedload` and adds `id.asc()` tiebreakers → M2 audit #5 carried forward correctly.

## Findings — ordered by severity, then blast radius

---

### 1. `frontend/src/app/(main)/chat/[groupId]/page.tsx` will crash on next render — contract changed under it

**Severity: Critical**
**Fix required?** YES — this is a user-visible runtime crash the moment M5 backend ships.

Description :
The frontend chat-room page reads `msg.sender_name.charAt(0)`, `msg.content`,
`msg.timestamp`, `msg.is_mine` directly
(`frontend/src/app/(main)/chat/[groupId]/page.tsx:60-75`). The new
`ChatMessageOut` schema returns `body`, `created_at`, `author.{id,name,avatar_url}`.
`msg.sender_name` is `undefined`, and `undefined.charAt(0)` throws
`TypeError: Cannot read properties of undefined (reading 'charAt')`, blanking
the entire chat room. The plan doc acknowledges this ("same trade-off as
`/rides/create` after M3") but ships anyway. Every existing chat link in
the app now leads to a white screen.

Required Fixes :
Either (a) gate the M5 deploy behind a UX-track frontend PR that updates the
chat page to read the canonical shape — recommended path; or (b) keep a
back-compat response shim on the server until the UX rewrite lands. For (a),
rewrite the chat page to render `msg.author?.name`, `msg.body`,
`msg.created_at`, and derive `is_mine` as `msg.author?.id === currentUser.id`
(the schema doc says this is intentional). Add a TypeScript interface
mirroring `ChatMessageOut` so the build catches the next shape change.
Test: render with empty, one-author, and multi-author message lists; verify
the avatar initial, timestamp formatting, and `is_mine` alignment. Verify
that `currentUser.id` is available before render — guard with a loading
state if not.

Required Files Changes :
- frontend/src/app/(main)/chat/[groupId]/page.tsx
- frontend/src/lib/types.ts (add canonical `ChatMessage` type)
- frontend/src/lib/api.ts (type `getChatMessages` return)
- frontend/src/__tests__/chat-page.test.tsx (new)

---

### 2. `deleteChatMessage` will throw on success — `request<T>` calls `res.json()` on 204 No Content

**Severity: Critical**
**Fix required?** YES — every successful deletion currently surfaces as an error toast.

Description :
The backend `DELETE /api/chat/messages/{id}` returns `Response(status_code=204)`
with an empty body. The frontend `request<T>` helper
(`frontend/src/lib/api.ts:40-47`) unconditionally calls `return res.json()`
on a successful response — `res.json()` on an empty 204 body throws
`SyntaxError: Unexpected end of JSON input`. So a successful delete bubbles
up as a thrown error, the UI shows a generic failure toast, the user retries
and gets a 404 the second time (because the message *was* actually deleted)
— a wholly confusing flow. The same defect affects any other 204 endpoint
(e.g. future `DELETE /rides/{id}` if it switches to 204).

Required Fixes :
Branch on the response status in `request<T>`: if `res.status === 204` or
`Content-Length === '0'`, return `undefined as unknown as T`. Alternatively
return `null` and have the typed signature reflect that. While there, also
guard against successful responses with a non-JSON `Content-Type` (rare but
possible behind misconfigured proxies). Update `deleteChatMessage` return
type to `Promise<void>`. Tests: 204 returns resolved promise with no body;
200 with empty body returns resolved (defensively); 200 with JSON returns
the parsed object; 4xx still throws with the formatted detail message.

Required Files Changes :
- frontend/src/lib/api.ts
- frontend/src/__tests__/api.delete-204.test.ts (new)

---

### 3. `since` polling can drop messages on equal-microsecond timestamps

**Severity: Major**
**Fix required?** YES — silent data loss in the chat surface is unacceptable.

Description :
`list_messages` with the poll path uses `ChatMessage.created_at > since`
(`backend/app/routers/chat.py:243`). The client sets the next `since` to the
`created_at` of the most-recent received message. If two messages are
inserted at the *same* Postgres microsecond (under contention this is rare
but real — two participants sending at the same time on a fast host), the
second message lands with `created_at == since` and is silently filtered out
of the next poll. The receiver never sees that message until they refresh
or reopen the chat. Active group chats with several simultaneous senders
are exactly the scenario where this triggers.

Required Fixes :
Switch to keyset polling: track the last seen `(created_at, id)` tuple on
the client and filter
`(created_at > since) OR (created_at = since AND id > last_id)`. The
`idx_chat_messages_group_time` index already covers this. Alternatively,
have the client send `?after_id={last_msg_id}` and let the server resolve
the tuple — simpler API. Either way, also reject `since` values without a
timezone (FastAPI parses naive datetimes as-is and the Postgres compare
against `timestamptz` either errors or implicit-coerces in the server's
timezone). Tests: insert 50 messages with `created_at` clamped to identical
second, poll with `since=that_second`, assert all 50 are returned across
the paged polls.

Required Files Changes :
- backend/app/routers/chat.py
- backend/app/schemas/chat.py (optional: add `after_id` param)
- backend/tests/test_chat_polling.py (new)

---

### 4. No backward-pagination cursor — chat history past `limit` is unreachable

**Severity: Major**
**Fix required?** YES — without history paging, chats with > 50 messages can never be fully scrolled.

Description :
The initial-load path (`since=None`) fetches the newest `limit` messages
ordered DESC, reverses them in Python, and returns with `has_more` set when
`len(rows) == limit`. There is **no `before_id` / `before_ts` parameter**
to fetch the next-older page. A chat room with 500 historical messages only
ever shows the most recent 50, and the documented `has_more=true` signal is
a dead end on the client. The plan doc mentions polling forward but does
not specify backward navigation — but the schema's `has_more` advertises
something the API can't actually deliver.

Required Fixes :
Add `before: Optional[datetime] = Query(default=None)` (and `before_id` for
the tuple) to `GET /messages`. On the backward path, filter
`created_at < before` (or the tuple), order DESC, limit, reverse for the
response so the client can prepend. Return a `next_cursor: Optional[str]`
in `ChatMessageListResponse` that the client passes back unchanged — opaque
cursors hide the implementation. Update the frontend `getChatMessages`
type to accept `before` and surface `next_cursor`. Tests: chat with 200
messages — initial load returns last 50 with `has_more=true`; subsequent
`before=oldest_ts` returns the previous 50; eventually `has_more=false`.

Required Files Changes :
- backend/app/routers/chat.py
- backend/app/schemas/chat.py
- frontend/src/lib/api.ts
- backend/tests/test_chat_history.py (new)

---

### 5. REST polling has no rate limit, no backoff, no tab-visibility pause

**Severity: Major**
**Fix required?** YES at the server tier; recommend at the client tier.

Description :
The plan endorses 5–10 s REST polling but ships zero server-side guards.
With N viewers per chat polling every 5 s, a popular group ride (50
approved members) generates 10 RPS *per ride*; 100 active rides becomes
1000 RPS just for chat polling. The server has no rate limit and no
HTTP-cache hints (`ETag`/`If-None-Match`, `Cache-Control: max-age`) — every
poll runs the full SELECT against `chat_messages` even when nothing
changed. The frontend has no `document.visibilityState === 'hidden'` pause,
so backgrounded tabs keep polling forever, draining mobile battery and
your DB pool.

Required Fixes :
Server: add a per-user-per-group rate cap (e.g. 1 req / 2 s for polls,
1 send / 1 s for POST) via `slowapi`. Emit `ETag` based on
`MAX(created_at) WHERE chat_group_id = :gid` and return 304 Not Modified
when the client's `If-None-Match` matches — costs one cheap MAX query and
saves the whole SELECT + serialization. Cap the unauthenticated path (does
not exist today — every chat endpoint requires auth — but defence-in-depth).
Frontend: pause the polling interval on `visibilitychange` to hidden;
resume with an immediate fetch on visible. Use exponential backoff on
network errors. Tests: simulated 200-client poll burst stays under DB-pool
high water mark; 304 path returns < 50 ms.

Required Files Changes :
- backend/app/routers/chat.py
- backend/app/services/limits.py (new)
- frontend/src/app/(main)/chat/[groupId]/page.tsx
- backend/tests/test_chat_rate_limit.py (new)

---

### 6. `send_message` accepts no idempotency key — retries / double-submit create duplicates

**Severity: Major**
**Fix required?** YES — flaky-network retry is the most common cause of duplicate-message UX bugs.

Description :
`POST /api/chat/groups/{id}/messages` inserts a new `ChatMessage` with each
call. The frontend has no exponential-backoff retry today, but the next UX
iteration almost certainly will (user taps send, the request stalls, they
tap again) — and the form re-submit on Enter in an SPA without a global
in-flight gate is a classic duplicate-message source. The current contract
provides no `client_message_id` or `Idempotency-Key` header for the server
to dedupe against.

Required Fixes :
Add an optional `client_id: Optional[UUID]` to `ChatMessageCreate` (or
accept an `Idempotency-Key` request header). Persist it as a nullable
column with a partial unique index `(chat_group_id, author_id, client_id)
WHERE client_id IS NOT NULL`. On POST, if a row with the same triplet
exists, return that row's `ChatMessageOut` instead of inserting. The
frontend generates a UUID per send attempt and reuses it for retries.
Tests: same `client_id` sent twice returns the same `id` and only one row
in `chat_messages`; different `client_id` inserts a second row.

Required Files Changes :
- backend/app/models/chat.py
- backend/app/schemas/chat.py
- backend/app/routers/chat.py
- backend/alembic/versions/{new}_chat_message_client_id.py (new)
- frontend/src/lib/api.ts
- backend/tests/test_chat_send_idempotency.py (new)

---

### 7. Hard-delete on messages means viewers' clients keep stale rows forever

**Severity: Major**
**Fix required?** YES — soft-delete is the right primitive for chat moderation.

Description :
`delete_message` calls `db.delete(msg)` and commits
(`backend/app/routers/chat.py:339`). A viewer who already polled the
message has it in their local state — no subsequent poll will ever
mention the deletion, because the row is gone. The viewer sees the
deleted message until they hard-refresh; the captain who deleted it
sees it disappear locally (they're the actor). For abuse moderation
this is a serious gap: the captain deletes a slur, but every approved
member who already saw it still sees it on screen.

Required Fixes :
Add `deleted_at: Optional[datetime]` to `ChatMessage` (Alembic migration).
On DELETE, set `deleted_at = func.now()` and `body = ""` (or keep body
for audit; decide privacy posture). Update `list_messages` to include
deleted messages (so the client can replace its local copy with a
"[deleted]" placeholder) — surface a `deleted_at` field on
`ChatMessageOut`. The frontend renders deleted rows with a muted "this
message was removed" placeholder. Tests: delete a message; next poll
returns the row with `deleted_at` set and empty body; client renders
the placeholder.

Required Files Changes :
- backend/app/models/chat.py
- backend/app/schemas/chat.py
- backend/app/routers/chat.py
- backend/alembic/versions/{new}_chat_message_soft_delete.py (new)
- frontend/src/app/(main)/chat/[groupId]/page.tsx
- backend/tests/test_chat_soft_delete.py (new)

---

### 8. No server-enforced length cap — Pydantic limit is bypassable

**Severity: Major**
**Fix required?** YES — defence in depth; the API is not the only writer.

Description :
`ChatMessageCreate.body = Field(min_length=1, max_length=MAX_BODY_LEN)`
caps body at 2000 chars **at the API layer only**. The `chat_messages.body`
column is `Text` with no `CheckConstraint`. Any future ingestion path
(seed script, admin tool, a background worker that mirrors imports) can
write multi-MB blobs and they survive; the next poll then returns a 5 MB
message JSON that crushes mobile clients. The model also has no
`CheckConstraint("char_length(body) > 0")`, so empty bodies sneaking past
Pydantic are accepted.

Required Fixes :
Add
`CheckConstraint("char_length(body) BETWEEN 1 AND 2000",
name="ck_chat_message_body_length")` to `ChatMessage.__table_args__`, and
mirror it in an Alembic migration. Keep `MAX_BODY_LEN` as a single source
of truth (export from the model and import into the schema). Tests: direct
INSERT of an oversize body fails; INSERT of empty body fails; API
endpoint still returns 422 for the same.

Required Files Changes :
- backend/app/models/chat.py
- backend/app/schemas/chat.py
- backend/alembic/versions/{new}_chat_message_body_check.py (new)
- backend/tests/test_chat_body_constraint.py (new)

---

### 9. `since` datetime parsing accepts naive datetimes — silent timezone drift

**Severity: Major**
**Fix required?** YES, but small surface — easy to land.

Description :
`since: Optional[datetime] = Query(default=None)` accepts ISO 8601 from the
URL. FastAPI/pydantic parses naive strings (no offset) as naive `datetime`
objects. The DB column is `timestamptz`. SQLAlchemy passes the naive
value through; Postgres applies the server's `TimeZone` setting to coerce.
If the server is `UTC` and the client (in IST = UTC+5:30) sends a naive
"2026-05-24T10:00:00", Postgres treats it as UTC, so the filter is 5h 30m
off — the client sees messages from 5.5 hours ago repeatedly until the
clock catches up. The bug is silent and intermittent.

Required Fixes :
Add a validator on the query param (or via `Annotated[datetime, AfterValidator(...)]`)
that rejects naive datetimes with a clear 422
("since must include a timezone offset"). Document the contract in the
schema docstring. The frontend's `new Date().toISOString()` always emits
`Z`-suffixed UTC, so the typical happy path is unaffected; this rejects
broken clients early. Tests: naive `since` → 422; aware `since` → respected.

Required Files Changes :
- backend/app/routers/chat.py
- backend/tests/test_chat_since_validation.py (new)

---

### 10. Membership-leak via timing: `_load_group_or_404` runs the participant query *after* the group SELECT

**Severity: Major**
**Fix required?** YES — same-shape 404 is defeated by response-time analysis.

Description :
`_load_group_or_404` (`backend/app/routers/chat.py:74-101`) issues two SQL
statements for the non-captain path: SELECT the group, then SELECT the
participant. For a non-existent group, only the first query fires before
404. For a real group where the caller is not approved, both queries fire
before 404. The total response time is measurably different (one
round-trip vs two), so an attacker who has a list of UUIDs can distinguish
"group exists, you're not in it" from "group doesn't exist" via timing —
exactly what the 404 was designed to prevent.

Required Fixes :
Collapse to a single SELECT that joins the group, the ride plan, and the
caller's participant row (LEFT JOIN) and returns the membership flag in
one round trip. Always read the join even when the group is missing
(a `SELECT 1 FROM ... LEFT JOIN` that returns 0 rows for a missing group
costs the same as 1-row case). Document the timing-safety property in
the helper docstring. Tests: measure response time for the three states
(missing / non-member / member) — assert variance is within noise. Add a
benchmark fixture so regressions don't reintroduce the timing leak.

Required Files Changes :
- backend/app/routers/chat.py
- backend/tests/test_chat_membership_timing.py (new)

---

### 11. No `WebSocket` / SSE story — REST polling is the only push primitive

**Severity: Major**
**Fix required?** NO for MVP, but the architectural decision deserves a written escape hatch.

Description :
The plan locks in REST polling for MVP. Reasonable for a 1.5 week scope.
But every chat product eventually needs push (typing indicators, read
receipts, instant message delivery), and the M5 contract bakes in
client-pull semantics that don't translate cleanly to a future SSE/WS
backend. There's no message-version field, no server-side change-stream
abstraction, no clean place to plug in a fan-out worker.

Required Fixes :
NOT required to ship M5. But document the migration path in
`docs/plan/m5-real-chat.md`: how the `since` cursor maps to an
`EventSource` `Last-Event-ID`, where a Redis Pub/Sub or Postgres
`LISTEN/NOTIFY` integration would sit, and what shape a `ChatEvent`
wrapper would take (`{type: 'message.created' | 'message.deleted',
payload: ChatMessageOut}`). Capture the call so M9 (or whoever owns
real-time) doesn't reinvent it.

Required Files Changes :
- docs/plan/m5-real-chat.md
- docs/plan/m9-realtime.md (new, stub)

---

### 12. Cancelled-ride chat remains writable

**Severity: Minor**
**Fix required?** Product call — likely YES for closure, but small UX work.

Description :
`cancel_ride` in `routers/rides.py` sets `RidePlan.status =
RidePlanStatus.cancelled` but does not delete or freeze the associated
`ChatGroup`. Approved members can keep posting messages on a cancelled
ride. The current behaviour might be intentional (a "what happened?"
debrief), but it isn't documented and isn't obvious to the captain who
cancelled — they're presumably done.

Required Fixes :
Decide product intent. If cancelled rides should be read-only chats,
filter `send_message` and `delete_message` on
`ride.status != RidePlanStatus.cancelled` and return 409 if cancelled.
If they should be fully closed, archive the `ChatGroup` (add an
`archived_at` column) and 404 on writes. Either way, surface the state
in `ChatGroupRide.status` (already there) so the frontend can render a
read-only banner. Tests: cancel a ride, attempt to send → 409;
attempt to read → still allowed.

Required Files Changes :
- backend/app/routers/chat.py
- backend/app/models/chat.py (optional `archived_at`)
- backend/tests/test_chat_cancelled_ride.py (new)

---

### 13. No HTML/Markdown sanitization or storage normalization on `body`

**Severity: Minor**
**Fix required?** YES, but the safer fix is documented "client must escape" + a single render-time helper.

Description :
The body is stored raw text. If any frontend renders chat with
`dangerouslySetInnerHTML` (or a future markdown renderer that allows raw
HTML), an attacker who posts `<img src=x onerror=...>` triggers XSS for
every member. Today the chat-page template uses `{msg.content}` JSX
text interpolation (safe), but the M5 rewrite of that page is in scope
of finding #1 — easy to slip a dangerous renderer in then. The server
also doesn't normalize whitespace beyond `.strip()` — a user can post
`"   ​​​"` (zero-width spaces) and the validator currently
rejects only after `.strip()` collapses the leading whitespace; but
zero-width spaces inside are accepted, enabling subtle UI tricks.

Required Fixes :
Decide whether the chat supports plain text or Markdown. For plain text:
keep the server contract as today and add a frontend rule that body is
always rendered via JSX text interpolation (forbid
`dangerouslySetInnerHTML` in chat). For Markdown: render with
`react-markdown` + `rehype-sanitize` and a strict allow-list. Reject
control characters and zero-width characters on the server with a
unicode-category check. Tests: a body containing `<script>` is rendered
as literal text; control chars are rejected with 422.

Required Files Changes :
- backend/app/schemas/chat.py
- frontend/src/app/(main)/chat/[groupId]/page.tsx
- backend/tests/test_chat_xss.py (new)

---

### 14. `ChatGroup.name` is set to `ride.title` at creation and never re-syncs

**Severity: Minor**
**Fix required?** Optional; document the divergence or auto-sync.

Description :
`routers/rides.py::create_ride` writes
`ChatGroup(name=ride.title)`. If the captain later renames the ride
via `PUT /rides/{id}`, `ChatGroup.name` stays at the old title.
The list-groups response surfaces both `name` and
`ride.title` (the latter via `ChatGroupRide.title`), so the UI shows two
different names for the same room.

Required Fixes :
Option A — drop `ChatGroup.name` and always render `ride.title` (preferred;
the redundancy serves no purpose). Requires removing the `name` column or
making it nullable, plus a schema field deprecation. Option B — keep
the column but update it inside `update_ride` whenever `title` changes.
Tests: rename a ride, assert chat header reflects the new name.

Required Files Changes :
- backend/app/routers/rides.py
- backend/app/models/chat.py
- backend/app/schemas/chat.py (drop `name` if A)

---

### 15. `_load_group_or_404` returns `(group, role)` but role is always discarded at call sites

**Severity: Minor**
**Fix required?** NO; dead-code cleanup only.

Description :
Every caller does `group, _ = _load_group_or_404(...)`. The `role` return
is dead code, suggesting an unimplemented intent (probably "use role to
authorize the delete path"). The delete handler in fact re-derives
captaincy independently (`is_captain = ride.captain_id == user.id`),
duplicating the role logic.

Required Fixes :
Either remove the role return (simpler) or use it in `delete_message` to
avoid the second `ride.captain_id` comparison. Pick one path so the helper
matches the call sites.

Required Files Changes :
- backend/app/routers/chat.py

---

### 16. `ChatGroup.ride_plan is None` check is unreachable

**Severity: Minor**
**Fix required?** NO; cosmetic.

Description :
`_load_group_or_404` returns 404 if `group.ride_plan is None`
(`backend/app/routers/chat.py:91`). But `ChatGroup.ride_plan_id` is
`nullable=False` and has an FK with `ondelete="CASCADE"`. A row with a
NULL ride_plan can't exist; if the ride is deleted, the chat group is
deleted too. The check survives only as defensive code.

Required Fixes :
Keep the check if you want defence-in-depth against future schema changes,
but add a `# noqa` comment explaining it's belt-and-braces. Or drop it.

Required Files Changes :
- backend/app/routers/chat.py

---

### 17. `chat_messages.author_id` cascades on user delete → all the user's messages vanish

**Severity: Minor**
**Fix required?** Product call.

Description :
`ChatMessage.author_id` has `ondelete="CASCADE"`. When a user deletes
their account (no such endpoint exists yet, but auth eventually will),
every message they sent across every chat disappears. Other participants
lose context — what looks like a coherent conversation now has the other
half missing. Most chat products soft-delete the user and render
"[deleted user]" in place.

Required Fixes :
NOT required for M5; revisit when account-deletion lands. When it does,
change `author_id` to `ON DELETE SET NULL` (`author_id` then nullable),
and update `ChatMessageOut.author` to be `Optional[UserBrief]` with the
frontend rendering "[deleted user]" when null. Document in
`docs/plan/m5-real-chat.md`.

Required Files Changes :
- backend/app/models/chat.py (when account deletion ships)
- docs/plan/m5-real-chat.md

---

### 18. `_approved_counts_for` is duplicated between `routers/chat.py` and `routers/rides.py`

**Severity: Minor**
**Fix required?** YES (small refactor).

Description :
The exact same helper exists in both routers. The chat-router docstring
calls this out and justifies the duplication ("keep the chat router free
of router-to-router imports"). That's a reasonable structural rule, but
the right resolution is to extract the helper to a service module, not
to keep a stale copy in each router.

Required Fixes :
Move the helper to `backend/app/services/rides_service.py` (or similar)
and import from both routers. Add a regression test for the helper. No
behaviour change; pure refactor.

Required Files Changes :
- backend/app/services/rides_service.py (new)
- backend/app/routers/chat.py
- backend/app/routers/rides.py
- backend/tests/test_approved_counts.py (new)

---

### 19. `Optional[UserBrief]` on `ChatMessageOut.author` — but the DB column is NOT NULL

**Severity: Minor**
**Fix required?** Tighten the schema or document the optionality.

Description :
`ChatMessageOut.author: Optional[UserBrief] = None`
(`backend/app/schemas/chat.py:68`) declares optionality even though
`author_id` is `nullable=False`. Today the field can never be None in a
valid response, but TypeScript-side consumers will be forced into
unnecessary null guards. This drifts from the actual contract and makes
the frontend code uglier.

Required Fixes :
Tighten to `author: UserBrief`. The author is guaranteed to exist for as
long as the cascade behaviour is in place. If you take finding #17 in the
future (account deletion → SET NULL), revisit then. Update consumers.
Tests: parsing a valid response succeeds with the tight type.

Required Files Changes :
- backend/app/schemas/chat.py
- frontend/src/lib/types.ts (when added)

---

### 20. `list_groups` does no message-preview / unread-count surface

**Severity: Minor**
**Fix required?** NO for ship, but it's a UX gap the next iteration must close.

Description :
The list-groups endpoint returns rooms with name, ride summary, and
participant count — no last-message preview, no unread count. The
`/chat` index page can't render the usual "[Captain]: see you at 7 am
- 2m ago · 3 unread" affordance without an additional round-trip
(or N round-trips) per group. The plan doc punts this; it's worth
calling out explicitly so the UX track scopes correctly.

Required Fixes :
Add a `last_message: Optional[ChatMessagePreview]` and `unread_count:
int` to `ChatGroupOut`. `last_message` can be computed with a window-
function CTE; `unread_count` requires tracking a per-user-per-group
`last_read_at` (new table or column). For M5 ship-as-is, document the
deferral. Tests: list returns N groups in 1 SQL statement; preview
matches the actual newest message.

Required Files Changes :
- docs/plan/m5-real-chat.md (deferral note)
- (later) backend/app/models/chat.py + a `chat_group_reads` table

---

### 21. Polling pings the DB even when there are no new messages — missing `If-Modified-Since` short circuit

**Severity: Minor**
**Fix required?** Covered by finding #5 (`ETag`/304). Listed here for completeness.

Description :
Already part of finding #5; the server has no cheap "nothing changed"
response. Each poll runs the indexed but still full SELECT.

Required Fixes :
See finding #5.

Required Files Changes :
- (see #5)

---

### 22. Frontend `api.ts` chat methods still return `Promise<unknown>` — no types

**Severity: Minor**
**Fix required?** YES (small).

Description :
Carried forward from M2/M3/M4 audits — `getChatGroups`, `getChatGroup`,
`getChatMessages`, `sendChatMessage`, `deleteChatMessage` all return
`Promise<unknown>`. Consumers cast manually; future shape changes
silently rot. The fix is trivial because the canonical schemas already
exist on the backend.

Required Fixes :
Add `frontend/src/lib/api.types.ts` (if not already present from prior
audits) mirroring `ChatGroupListResponse`, `ChatGroupOut`, `ChatGroupRide`,
`ChatMessageListResponse`, `ChatMessageOut`. Update each method's return
type. Confirm `getChatMessages` `since` param is typed as a
timezone-aware ISO string (combine with finding #9).

Required Files Changes :
- frontend/src/lib/api.types.ts
- frontend/src/lib/api.ts

---

### 23. `frontend/src/app/(main)/chat/[groupId]/page.tsx` send button never hits the API

**Severity: Minor**
**Fix required?** YES — same fix as #1.

Description :
The existing chat page's `handleSend` constructs a local `ChatMessage`
object and only updates local state — it never calls
`api.sendChatMessage` (which didn't exist before this PR). After M5,
the new method exists but the UI still doesn't call it; the user's
"send" is purely cosmetic and disappears on refresh. Both this and
finding #1 must be addressed in the UX-track rewrite.

Required Fixes :
Rewrite `handleSend` to call `api.sendChatMessage(groupId, input.trim())`,
optimistically prepend the message with a local `client_id` (paired with
finding #6), and on response replace the optimistic row with the
canonical one. On error, mark the row as failed and offer a retry. Also
disable the send button while in-flight.

Required Files Changes :
- frontend/src/app/(main)/chat/[groupId]/page.tsx

---

### 24. `commit-m2.sh` is an untracked dev script that should not land

**Severity: Minor**
**Fix required?** YES — git hygiene.

Description :
`git status` shows `commit-m2.sh` as untracked. Its name suggests an
ad-hoc local helper from the M2 milestone. Untracked files don't ship,
but they tend to get accidentally `git add .`'d into PRs and pollute
history. They also sometimes contain secrets (signing creds, deploy
tokens) — worth glancing at and either gitignoring or deleting.

Required Fixes :
Either delete `commit-m2.sh` if it's no longer needed, or add it to
`.gitignore` (or a top-level `scripts/` directory with documented
purpose). Confirm it contains no secrets.

Required Files Changes :
- commit-m2.sh (delete) or .gitignore

---

## Triage — ship gate

**Must-fix before merging:**

- **#1** chat page crash (UX-track)
- **#2** 204 JSON parse error (one-liner)
- **#3** since-poll microsecond drop
- **#4** missing backward pagination
- **#8** server-side body length cap
- **#9** since-timezone validation
- **#10** membership-leak timing

**Land in a fast-follow (same milestone, separate PR):**

- **#5** rate limit + ETag + visibility pause
- **#6** idempotency key
- **#7** soft delete
- **#13** XSS / sanitization policy
- **#22** typed API client
- **#23** UI hooked up to send endpoint

**Defer / document only:**

- **#11** websocket migration plan
- **#12** cancelled-ride chat policy
- **#14** ChatGroup name sync
- **#15** dead `role` return
- **#16** unreachable null check
- **#17** account-deletion cascade
- **#18** helper duplication (small refactor anytime)
- **#19** tighten `Optional[UserBrief]`
- **#20** last-message / unread surface
- **#24** stray `commit-m2.sh`

## What I checked specifically this round (vs prior audits)

This audit re-verified the resolutions to prior-audit findings before
re-flagging:

- M2 audit #13/15 (frontend renders 422 as `[object Object]`) →
  `formatErrorDetail` in `frontend/src/lib/api.ts:5-23` resolves it.
- M2 audit #5 (pagination tiebreaker) → chat router uses
  `created_at DESC, id DESC` and `created_at ASC, id ASC` correctly.
- M2 audit #8 / #18 (N+1 on submit) → `send_message` already re-fetches
  with `selectinload(ChatMessage.author)` to avoid the lazy-load.
- M2 audit #14 (CORS) → still only `localhost:3000`; M5 doesn't widen it
  further but the existing finding stands.
- M2 audit #10 (JWT hardening) → unchanged; carry forward.

Things I deliberately did not flag (verified non-issues):

- `or_` in `list_groups` returning duplicate `ChatGroup` rows for captains
  who are also auto-joined as approved participants — the `db.query(ChatGroup)`
  with a 1:1 `RidePlan` join can't return duplicates because `ChatGroup` is
  the FROM table.
- Solo-ride chat 404s — confirmed correct: M3 only creates `ChatGroup` for
  `visibility=group`.
- Captain-as-participant check — captain is also in `RidePlanParticipant`
  with `status=approved`, so both branches of the `or_` would match, but
  the captain branch short-circuits in `_load_group_or_404`.
- `joinedload` cartesian explosion on `list_groups` — chain is single-row
  to single-row, no fanout.
