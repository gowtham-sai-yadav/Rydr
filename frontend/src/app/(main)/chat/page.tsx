"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import type { ChatGroupOut, DMThreadOut } from "@/lib/api.types";
import { routes } from "@/lib/routes";
import Avatar from "@/components/ui/Avatar";
import {
  Alert,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui";

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
    return <Spinner size="lg" block />;
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="font-display text-2xl font-bold text-ink tracking-tight mb-6">
        Chat
      </h1>

      {error && (
        <div className="mb-4">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      <div className="mb-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="rides">Group rides</TabsTrigger>
            <TabsTrigger value="messages" className="relative">
              Messages
              {unreadThreads > 0 && (
                <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent-red text-canvas text-[10px] leading-none font-bold flex items-center justify-center">
                  {unreadThreads}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
              <Link key={group.id} href={routes.chatRoom(group.id)}>
                <div className="bg-surface-card border border-hairline rounded-[var(--radius-card)] p-4 hover:bg-surface-elevated hover:border-hairline-strong transition-colors cursor-pointer flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center shrink-0">
                    <MessageSquare className="w-5 h-5 text-accent-gold" />
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
                <Avatar
                  name={thread.other_user.name}
                  avatarUrl={thread.other_user.avatar_url}
                  size="lg"
                />
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
