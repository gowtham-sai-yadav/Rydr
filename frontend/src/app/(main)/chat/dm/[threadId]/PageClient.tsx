"use client";
import { useState, useEffect, use, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { DirectMessageOut, DMThreadOut } from "@/lib/api.types";
import Avatar from "@/components/ui/Avatar";

const POLL_INTERVAL_MS = 4000;

export default function DMThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const { user } = useAuth();

  const [thread, setThread] = useState<DMThreadOut | null>(null);
  const [messages, setMessages] = useState<DirectMessageOut[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const mergeMessages = useCallback((incoming: DirectMessageOut[]) => {
    const fresh = incoming.filter((m) => !seenIdsRef.current.has(m.id));
    if (fresh.length === 0) return;
    fresh.forEach((m) => seenIdsRef.current.add(m.id));
    setMessages((prev) => [...prev, ...fresh]);
  }, []);

  // Threads list gives us other_user without a round trip, but we don't
  // have it when arriving straight at a thread URL — fetch messages, which
  // is enough to render (the header falls back to "Chat").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getDMMessages(threadId, { limit: 100 });
        if (cancelled) return;
        setMessages(res.messages);
        seenIdsRef.current = new Set(res.messages.map((m) => m.id));
        const otherFromMessages = res.messages.find((m) => m.author.id !== user?.id)?.author;
        if (otherFromMessages) {
          setThread({ id: threadId, other_user: otherFromMessages, last_message: null, last_message_at: null, unread_count: 0 });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Short-poll for new messages — DMs aren't on the WebSocket ride-chat
  // channel, so this keeps the thread live without a second socket surface.
  useEffect(() => {
    if (loading) return;
    const handle = setInterval(async () => {
      try {
        const res = await api.getDMMessages(threadId, { limit: 100 });
        mergeMessages(res.messages);
      } catch {
        // Silent on background polls, same convention as NotificationBell.
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [threadId, loading, mergeMessages]);

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
      const msg = await api.sendDMMessage(threadId, body);
      mergeMessages([msg]);
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

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      <div className="card p-4 mb-4 flex items-center gap-3">
        <Link href="/chat" className="text-mute hover:text-ink shrink-0" aria-label="Back to chat list">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        {thread ? (
          <Link href={`/users/${thread.other_user.id}`} className="flex items-center gap-3 hover:opacity-80">
            <Avatar
              name={thread.other_user.name}
              avatarUrl={thread.other_user.avatar_url}
              size="md"
            />
            <h1 className="text-ink font-semibold">{thread.other_user.name}</h1>
          </Link>
        ) : (
          <h1 className="text-ink font-semibold">Chat</h1>
        )}
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-2 rounded-lg mb-2 text-sm">
          {error}
        </div>
      )}

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
                      <Avatar
                        name={msg.author.name}
                        avatarUrl={msg.author.avatar_url}
                        size="xs"
                      />
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
                    {isMine && msg.read_at && <span className="ml-1">· Seen</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

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
          aria-label="Send message"
          className="bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 w-12 h-12 rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
