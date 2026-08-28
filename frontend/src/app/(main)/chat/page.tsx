"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ChatGroupOut, DMThreadOut } from "@/lib/api.types";

type Tab = "rides" | "messages";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default function ChatPage() {
  const [tab, setTab] = useState<Tab>("rides");
  const [groups, setGroups] = useState<ChatGroupOut[]>([]);
  const [threads, setThreads] = useState<DMThreadOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.getChatGroups({ limit: 100 }), api.listDMThreads()])
      .then(([groupsRes, threadsRes]) => {
        setGroups(groupsRes.groups);
        setThreads(threadsRes.threads);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const unreadThreads = threads.filter((t) => t.unread_count > 0).length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-2xl font-bold text-ink mb-6">Chat</h1>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6" role="tablist" aria-label="Chat category">
        <button
          role="tab"
          aria-selected={tab === "rides"}
          onClick={() => setTab("rides")}
          className={`chip ${tab === "rides" ? "chip-active" : ""}`}
        >
          Group Rides
        </button>
        <button
          role="tab"
          aria-selected={tab === "messages"}
          onClick={() => setTab("messages")}
          className={`chip relative ${tab === "messages" ? "chip-active" : ""}`}
        >
          Messages
          {unreadThreads > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-ink text-[10px] leading-4 font-semibold flex items-center justify-center">
              {unreadThreads}
            </span>
          )}
        </button>
      </div>

      {tab === "rides" ? (
        groups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-mute">No chat groups yet</p>
            <p className="text-stone text-sm mt-1">
              Plan or join a group ride to start chatting — every group ride gets one automatically.
            </p>
            <Link
              href="/rides"
              className="text-accent-gold hover:text-accent-gold text-sm mt-2 inline-block"
            >
              Browse rides →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <Link key={group.id} href={`/chat/${group.id}`}>
                <div className="bg-surface-card rounded-xl p-4 hover:bg-surface-elevated hover:ring-1 hover:ring-hairline-strong transition-all cursor-pointer flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-accent-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-ink font-medium truncate">{group.name}</h3>
                    {group.ride && (
                      <p className="text-mute text-xs truncate">
                        {group.ride.destination_name && `${group.ride.destination_name} · `}
                        {group.ride.planned_date} · {group.ride.participant_count} riders
                        {group.ride.status !== "planned" && (
                          <span className="ml-1 capitalize">· {group.ride.status.replace("_", " ")}</span>
                        )}
                      </p>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-stone shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : threads.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-mute">No messages yet</p>
          <p className="text-stone text-sm mt-1">
            You can message any rider who follows you back — start from their profile.
          </p>
          <Link
            href="/leaderboard"
            className="text-accent-gold hover:text-accent-gold text-sm mt-2 inline-block"
          >
            Find riders →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link key={thread.id} href={`/chat/dm/${thread.id}`}>
              <div className="bg-surface-card rounded-xl p-4 hover:bg-surface-elevated hover:ring-1 hover:ring-hairline-strong transition-all cursor-pointer flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-ink text-canvas flex items-center justify-center text-sm font-bold shrink-0 overflow-hidden">
                  {thread.other_user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thread.other_user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    thread.other_user.name.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={`truncate ${thread.unread_count > 0 ? "text-ink font-semibold" : "text-ink font-medium"}`}>
                      {thread.other_user.name}
                    </h3>
                    {thread.last_message_at && (
                      <span className="caption shrink-0">{timeAgo(thread.last_message_at)}</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${thread.unread_count > 0 ? "text-ink" : "text-mute"}`}>
                    {thread.last_message || "Say hello…"}
                  </p>
                </div>
                {thread.unread_count > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-accent-gold text-canvas text-[10px] font-bold flex items-center justify-center shrink-0">
                    {thread.unread_count}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
