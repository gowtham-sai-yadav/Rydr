"use client";
import { useState, useEffect, use, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { ChatGroupOut, ChatMessageOut } from "@/lib/api.types";


const POLL_INTERVAL_MS = 5000;


export default function ChatRoomPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
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
  }, [loading, pollOnce]);

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
      const msg = await api.sendChatMessage(groupId, body);
      setMessages((prev) => [...prev, msg]);
      lastSeenIdRef.current = msg.id;
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
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
      </div>
    );
  }

  const ride = group?.ride;
  const isCancelled = ride?.status === "cancelled";

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      {/* Header — ride context */}
      {group && (
        <div className="bg-gray-800 rounded-xl p-4 mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-white font-semibold">{group.name}</h1>
            {ride && (
              <p className="text-gray-400 text-xs">
                {ride.destination_name && `${ride.destination_name} · `}
                {ride.planned_date} · {ride.participant_count} riders
              </p>
            )}
          </div>
          {ride && (
            <Link
              href={`/rides/${ride.id}`}
              className="text-orange-500 hover:text-orange-400 text-sm font-medium"
            >
              Ride →
            </Link>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-2 text-sm">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-12 text-sm">
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
                      <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold text-white">
                        {msg.author.name.charAt(0)}
                      </div>
                      <span className="text-gray-400 text-xs">{msg.author.name}</span>
                    </div>
                  )}
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                      isMine
                        ? "bg-orange-600 text-white rounded-br-md"
                        : "bg-gray-800 text-gray-200 rounded-bl-md"
                    }`}
                  >
                    {msg.body}
                  </div>
                  <p className={`text-xs text-gray-500 mt-1 ${isMine ? "text-right" : ""}`}>
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
        <div className="pt-4 border-t border-gray-800 text-center text-gray-500 text-sm py-3">
          This ride was cancelled — the chat is read-only.
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex gap-3 pt-4 border-t border-gray-800">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message…"
            maxLength={2000}
            disabled={sending}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-5 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white w-12 h-12 rounded-full flex items-center justify-center transition-colors"
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
