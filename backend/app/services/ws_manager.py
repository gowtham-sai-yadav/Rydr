"""In-process WebSocket connection registry for ride chat — Phase 4 W6.

Tracks which sockets are currently listening to which chat group so a message
persisted by one connection can be pushed to the others without polling.

Scope and its limit
-------------------
The registry is a plain dict in process memory. That is correct for a single
uvicorn worker and wrong for more than one: with ``--workers 4`` a rider
connected to worker 2 will not receive a message published on worker 1,
because worker 1's registry has never heard of them.

This is a deliberate, bounded choice rather than an oversight. Phase 4 §1.6
specifies "FastAPI WebSockets for group-ride chat (self-hosted, no extra
vendor cost)", and the fix for multi-worker fan-out is a Redis (or Postgres
LISTEN/NOTIFY) pub-sub layer between the workers — a new service, which the
phase plan explicitly does not budget for. The deployment therefore runs a
single worker, and :func:`broadcast` is the one function that would need to
change if that stops being true: give it a publish call and have each worker
subscribe. Nothing else in the codebase would move.

Recorded here rather than discovered later, because "chat silently drops
messages under load" is an expensive thing to learn in a demo.

Delivery semantics
------------------
Best-effort. A send that fails (browser tab closed mid-broadcast, half-open
TCP connection) drops that socket from the registry rather than aborting the
broadcast, so one dead client cannot stop the rest of the room from hearing
the message. Chat history is durable in Postgres regardless — the socket is a
delivery optimisation over the existing REST endpoints, not the system of
record, so a missed frame costs a reconnect and a re-fetch, not data.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any, Dict, Set
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ChatConnectionManager:
    """Maps chat-group id → the set of live sockets in that room."""

    def __init__(self) -> None:
        self._rooms: Dict[UUID, Set[WebSocket]] = defaultdict(set)
        # The event loop the server is running on, captured the first time a
        # socket connects. Sync request handlers run in a threadpool worker
        # where ``asyncio.get_event_loop()`` does not return the server loop,
        # so a stored reference is the only way for them to schedule a
        # broadcast. Captured on connect rather than at startup because that
        # is guaranteed to run on the loop, needs no lifespan hook, and is
        # exactly when the loop first becomes relevant: with no sockets
        # connected there is nothing to broadcast to.
        self._loop: asyncio.AbstractEventLoop | None = None
        # Guards the mutation of _rooms. Broadcast iterates over a copy, so
        # the lock is only held for set add/discard, never across an await on
        # a socket send — a slow client cannot block the room.
        self._lock = asyncio.Lock()

    async def connect(self, group_id: UUID, socket: WebSocket) -> None:
        """Register an already-accepted socket.

        The caller accepts the handshake, because accepting is what commits to
        the connection and the caller is the one that has done the auth and
        membership checks.
        """
        self._loop = asyncio.get_running_loop()
        async with self._lock:
            self._rooms[group_id].add(socket)

    async def disconnect(self, group_id: UUID, socket: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(group_id)
            if room is None:
                return
            room.discard(socket)
            # Drop the empty set so a long-running process doesn't accumulate
            # one entry per chat group that has ever been opened.
            if not room:
                self._rooms.pop(group_id, None)

    async def broadcast(
        self, group_id: UUID, payload: Any, *, exclude: WebSocket | None = None
    ) -> int:
        """Push ``payload`` as JSON to every socket in the room.

        ``exclude`` skips one socket — used to avoid echoing a message back to
        the sender, which already rendered it optimistically.

        Returns the number of sockets that received it. Sockets that fail are
        removed from the room.
        """
        async with self._lock:
            targets = list(self._rooms.get(group_id, ()))

        delivered = 0
        dead: list[WebSocket] = []
        for socket in targets:
            if socket is exclude:
                continue
            try:
                await socket.send_json(payload)
                delivered += 1
            except Exception:  # noqa: BLE001 — a dead socket must not stop the room
                dead.append(socket)

        for socket in dead:
            await self.disconnect(group_id, socket)
        if dead:
            logger.info(
                "dropped %d dead socket(s) from chat room %s", len(dead), group_id
            )
        return delivered

    def schedule_broadcast(self, group_id: UUID, payload: Any) -> bool:
        """Broadcast from synchronous code (a normal ``def`` route handler).

        Returns True if the broadcast was handed to the event loop. Does not
        wait for delivery: the caller is answering an HTTP request and a slow
        socket must not add latency to it. Returns False when no loop has been
        captured yet, which means no socket has ever connected in this
        process and there is therefore nobody to broadcast to.

        Failure is not raised. The message this pushes is already committed
        and the HTTP response is the authoritative acknowledgement; a listener
        that misses the push re-syncs on its next ``GET /messages?since=``.
        """
        loop = self._loop
        if loop is None or loop.is_closed():
            return False
        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast(group_id, payload), loop
            )
            return True
        except Exception:  # noqa: BLE001 — delivery is best-effort by design
            logger.debug(
                "scheduling broadcast to room %s failed", group_id, exc_info=True
            )
            return False

    async def room_size(self, group_id: UUID) -> int:
        async with self._lock:
            return len(self._rooms.get(group_id, ()))


# Module-level singleton. One registry per process, which is the same scope as
# the process's set of live sockets.
manager = ChatConnectionManager()
