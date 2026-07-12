"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { chatGroupWsUrl } from "@/lib/ws";
import type { ChatMessageOut } from "@/lib/api.types";

type ConnectionStatus = "connecting" | "live" | "disconnected";

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 1000;

const statusDotColor: Record<ConnectionStatus, string> = {
  connecting: "bg-accent-yellow",
  live: "bg-accent-green",
  disconnected: "bg-accent-red",
};

/** Compact chat panel embedded directly under a ride's details, so an
 * approved rider doesn't have to navigate away to /chat to talk to the
 * group - opening the ride is enough. Same WebSocket protocol as the
 * standalone /chat/[groupId] room, just sized to sit inline instead of
 * filling the viewport. */
export function RideChatPanel({ groupId, readOnly }: { groupId: string; readOnly?: boolean }) {
  const { user } = useAuth();
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

  const appendMessage = useCallback((msg: ChatMessageOut) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await api.getChatMessages(groupId, { limit: 50 });
        if (cancelled) return;
        setMessages(m.messages);
        seenIdsRef.current = new Set(m.messages.map((msg) => msg.id));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  useEffect(() => {
    if (loading || readOnly) return;
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
          appendMessage(JSON.parse(event.data) as ChatMessageOut);
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onerror = () => {};
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
  }, [groupId, loading, readOnly, appendMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ body }));
      } else {
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

  return (
    <div className="card-bordered p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider">Ride Chat</h2>
        {!readOnly && (
          <span className="flex items-center gap-1.5 text-xs text-mute">
            <span className={`status-dot ${statusDotColor[status]}`} />
            {status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
        )}
      </div>

      {error && <p className="text-accent-red text-xs">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {messages.length === 0 ? (
            <p className="text-stone text-sm text-center py-6">No messages yet — say hi 👋</p>
          ) : (
            messages.map((msg) => {
              const isMine = !!user && msg.author.id === user.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[80%]">
                    {!isMine && <p className="text-mute text-xs mb-0.5">{msg.author.name}</p>}
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                        isMine ? "bg-ink text-canvas rounded-br-md" : "bg-surface-card text-ink rounded-bl-md"
                      }`}
                    >
                      {msg.body}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {readOnly ? (
        <p className="text-stone text-xs text-center pt-2 border-t border-hairline">
          This ride was cancelled — chat is read-only.
        </p>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2 pt-2 border-t border-hairline">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            disabled={sending}
            className="flex-1 bg-surface-card border border-hairline-strong rounded-full px-4 py-2 text-sm text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      )}
    </div>
  );
}
