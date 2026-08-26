"use client";
import { useState, useEffect, use, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { chatGroupWsUrl } from "@/lib/ws";
import type { ChatGroupOut, ChatMessageOut } from "@/lib/api.types";
import { ReportButton } from "@/components/moderation/ReportButton";

type ConnectionStatus = "connecting" | "live" | "disconnected";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

const statusLabel: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  disconnected: "Disconnected",
};

const statusDotColor: Record<ConnectionStatus, string> = {
  connecting: "bg-accent-yellow",
  live: "bg-accent-green",
  disconnected: "bg-accent-red",
};

export default function ChatRoomPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const { user } = useAuth();

  const [group, setGroup] = useState<ChatGroupOut | null>(null);
  const [messages, setMessages] = useState<ChatMessageOut[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const appendMessage = useCallback((msg: ChatMessageOut) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Initial load — group header + last N messages via HTTP.
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
        seenIdsRef.current = new Set(m.messages.map((msg) => msg.id));
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

  // Live updates over WebSocket — opened once history has loaded, with
  // exponential-backoff reconnect on drop.
  useEffect(() => {
    if (loading || !group) return;
    closedByUsRef.current = false;

    const connect = () => {
      setStatus((prev) => (prev === "live" ? prev : "connecting"));
      const ws = new WebSocket(chatGroupWsUrl(groupId));
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setStatus("live");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ChatMessageOut;
          appendMessage(data);
        } catch {
          // Ignore malformed frames rather than crashing the connection.
        }
      };

      ws.onerror = () => {
        // onclose fires right after — reconnect logic lives there.
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (closedByUsRef.current) return;
        setStatus("disconnected");
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) return;
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        reconnectHandleRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (reconnectHandleRef.current) clearTimeout(reconnectHandleRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [groupId, loading, group, appendMessage]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // The server pushes the ack back over the same socket, which
        // appendMessage dedupes against — no optimistic local insert needed.
        wsRef.current.send(JSON.stringify({ body }));
      } else {
        // WS not connected — fall back to HTTP so sending still works.
        const msg = await api.sendChatMessage(groupId, body);
        appendMessage(msg);
      }
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
            <span className="flex items-center gap-1.5 text-xs text-mute" title={statusLabel[status]}>
              <span className={`status-dot ${statusDotColor[status]}`} />
              {statusLabel[status]}
            </span>
          </div>
          {ride && (
            <p className="text-mute text-xs">
              {ride.destination_name && `${ride.destination_name} · `}
              {ride.planned_date} · {ride.participant_count} riders
            </p>
          )}
        </div>
        {ride && (
          <Link href={`/rides/${ride.id}`} className="link text-sm font-medium">
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
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words group relative ${
                      isMine
                        ? "bg-ink text-canvas rounded-br-md"
                        : "bg-surface-card text-ink rounded-bl-md"
                    }`}
                  >
                    {msg.body}
                  </div>
                  <div className={`flex items-center gap-2 mt-1 ${isMine ? "justify-end" : ""}`}>
                    <p className="text-xs text-stone">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {!isMine && (
                      <ReportButton targetType="chat_message" targetId={msg.id} className="mt-0 text-[10px]" />
                    )}
                  </div>
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
            className="bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 w-12 h-12 rounded-full flex items-center justify-center transition-colors"
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
