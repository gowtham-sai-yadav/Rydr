"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { useChatSocket } from "@/lib/hooks/useChatSocket";
import type { ChatGroupOut, ChatMessageOut } from "@/lib/api.types";
import { routes } from "@/lib/routes";


// Phase 4 W6: the socket carries messages when it is up. This poll is the
// fallback and only runs while the socket is down, so the interval no longer
// sets the latency floor for everyone.
const POLL_INTERVAL_MS = 5000;


function ChatRoomPageInner() {
  // Phase 4 W9: the record id arrives as a query parameter rather than a
  // path segment, so this route is one file that Next can statically
  // export for the Capacitor build. See lib/routes.ts for why.
  const groupId = useSearchParams().get("id") ?? "";
  const { user } = useAuth();

  const [group, setGroup] = useState<ChatGroupOut | null>(null);
  const [messages, setMessages] = useState<ChatMessageOut[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track the latest message id we've seen so the poll can use `after_id`.
  const lastSeenIdRef = useRef<string | null>(null);
  const pollHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Initial load — group header + last N messages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [g, m] = await Promise.all([
          api.getChatGroup(groupId),
          api.getChatMessages(groupId, { limit: 50 }),
        ]);
        if (cancelled) return;
        setGroup(g);
        setMessages(m.messages);
        if (m.messages.length > 0) {
          lastSeenIdRef.current = m.messages[m.messages.length - 1].id;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load chat");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  /**
   * Append a message unless it is already on screen.
   *
   * Both transports can deliver the same message: the socket echoes your own
   * send, and a poll that fires in the same window fetches it again by
   * after_id. De-duplicating on id here is what keeps the transports from
   * having to know about each other.
   */
  const ingest = useCallback((incoming: ChatMessageOut) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      const next = [...prev, incoming];
      lastSeenIdRef.current = next[next.length - 1].id;
      return next;
    });
  }, []);

  const { state: socketState, send: sendOverSocket } = useChatSocket({
    groupId,
    enabled: !loading && !!group,
    onMessage: ingest,
    onError: setError,
  });

  // Poll forward with after_id every POLL_INTERVAL_MS while page is visible.
  const pollOnce = useCallback(async () => {
    if (!lastSeenIdRef.current) return;
    try {
      const res = await api.getChatMessages(groupId, {
        after_id: lastSeenIdRef.current,
        limit: 50,
      });
      if (res.messages.length > 0) {
        setMessages((prev) => [...prev, ...res.messages]);
        lastSeenIdRef.current = res.messages[res.messages.length - 1].id;
      }
    } catch {
      // Silent — next poll retries. The screen still shows the last good state.
    }
  }, [groupId]);

  useEffect(() => {
    if (loading) return;
    // Socket is live — it delivers everything, so the poll would only
    // duplicate work and load the database for nothing.
    if (socketState === "open") return;

    const tick = () => {
      pollOnce();
      pollHandleRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    };

    // Pause polling when tab is hidden — saves battery + DB load.
    const onVisibility = () => {
      if (document.hidden) {
        if (pollHandleRef.current) {
          clearTimeout(pollHandleRef.current);
          pollHandleRef.current = null;
        }
      } else if (!pollHandleRef.current) {
        pollOnce();
        pollHandleRef.current = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    pollHandleRef.current = setTimeout(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (pollHandleRef.current) clearTimeout(pollHandleRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [loading, pollOnce, socketState]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");

    // Over the socket when it is open: the server echoes the persisted
    // message back, so `ingest` adds it with the real id and timestamp rather
    // than a locally invented one that would disagree with everyone else's
    // copy. Falls back to REST, which is also what runs when the socket is
    // down or unsupported.
    if (sendOverSocket(body)) {
      setInput("");
      setSending(false);
      return;
    }

    try {
      const msg = await api.sendChatMessage(groupId, body);
      ingest(msg);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  // The backend deliberately returns 404 for non-members (don't leak group
  // existence). Most paths into this page should be hidden upstream, but if
  // the user navigates here directly (old link, pending approval), show a
  // useful empty-state instead of leaving the send input hanging beneath a
  // bare error toast.
  if (!group) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <h2 className="heading-md">Chat unavailable</h2>
        <p className="text-mute text-sm">
          {error ||
            "This chat group doesn't exist, or you're not an approved participant of the ride."}
        </p>
        <p className="text-mute text-sm">
          Captains approve riders from the ride detail page. Once you&apos;re
          approved, the chat will open here.
        </p>
        <Link href="/rides" className="link text-sm">
          ← Back to rides
        </Link>
      </div>
    );
  }

  const ride = group.ride;
  const isCancelled = ride?.status === "cancelled";

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      {/* Header — ride context. `group` is guaranteed non-null here by the
          earlier short-circuit return. */}
      <div className="card p-4 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-ink font-semibold">{group.name}</h1>
            {/* Shown only when the socket is NOT carrying traffic. A green
                "connected" dot is noise; what a rider needs to know is that
                messages may be up to a few seconds late. */}
            {socketState !== "open" && (
              <span
                className="text-[11px] text-mute"
                title={
                  socketState === "connecting"
                    ? "Connecting for live updates"
                    : "Live updates unavailable — checking every few seconds"
                }
              >
                {socketState === "connecting" ? "connecting…" : "delayed"}
              </span>
            )}
          </div>
          {ride && (
            <p className="text-mute text-xs">
              {ride.destination_name && `${ride.destination_name} · `}
              {ride.planned_date} · {ride.participant_count} riders
            </p>
          )}
        </div>
        {ride && (
          <Link href={routes.ride(ride.id)} className="link text-sm font-medium">
            Ride →
          </Link>
        )}
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-2 rounded-lg mb-2 text-sm">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="text-center text-stone py-12 text-sm">
            No messages yet — say hi 👋
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = !!user && msg.author.id === user.id;
            return (
              <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-xs sm:max-w-md ${isMine ? "order-2" : ""}`}>
                  {!isMine && (
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-6 h-6 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold">
                        {msg.author.name.charAt(0)}
                      </div>
                      <span className="text-mute text-xs">{msg.author.name}</span>
                    </div>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                      isMine
                        ? "bg-ink text-canvas rounded-br-md"
                        : "bg-surface-card text-ink rounded-bl-md"
                    }`}
                  >
                    {msg.body}
                  </div>
                  <p className={`text-xs text-stone mt-1 ${isMine ? "text-right" : ""}`}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {isCancelled ? (
        <div className="pt-4 border-t border-hairline text-center text-stone text-sm py-3">
          This ride was cancelled — the chat is read-only.
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex gap-3 pt-4 border-t border-hairline">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            disabled={sending}
            className="flex-1 bg-surface-card border border-hairline-strong rounded-full px-5 py-3 text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-ink text-canvas hover:bg-surface-light disabled:opacity-50 w-12 h-12 rounded-full flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}


/**
 * Suspense boundary around ChatRoomPageInner.
 *
 * `useSearchParams` suspends during prerender, and the static export fails
 * with a missing-suspense-boundary error without this wrapper.
 */
export default function ChatRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      }
    >
      <ChatRoomPageInner />
    </Suspense>
  );
}
