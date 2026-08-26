"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import type { NotificationOut } from "@/lib/api.types";

const POLL_INTERVAL_MS = 30000;

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationOut[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getNotifications({ limit: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
      setError("");
    } catch {
      // Silent on background polls — the badge just keeps its last known
      // value rather than flashing an error toast on every tick.
    }
  }, []);

  useEffect(() => {
    refresh();
    const handle = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [refresh]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const togglePanel = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    }
  };

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(id);
    } catch {
      // Best-effort — a stale unread badge self-corrects on the next poll.
    }
  };

  const markAllRead = async () => {
    setNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      // Same as above — next poll reconciles.
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={togglePanel}
        aria-label="Notifications"
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface-elevated transition-colors text-charcoal hover:text-ink"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-ink text-[10px] leading-4 font-semibold flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] card-bordered p-0 overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
            <p className="text-sm font-medium text-ink">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-accent-blue hover:text-accent-blue"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-ink/20 border-t-ink" />
              </div>
            ) : error ? (
              <p className="text-accent-red text-xs px-4 py-4">{error}</p>
            ) : notifications.length === 0 ? (
              <p className="caption px-4 py-6 text-center">No notifications yet.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => !n.read_at && markRead(n.id)}
                  className={`w-full text-left px-4 py-3 border-b border-hairline last:border-0 transition-colors hover:bg-surface-elevated ${
                    n.read_at ? "" : "bg-surface-elevated/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="status-dot bg-accent-blue mt-1.5 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm">{n.message}</p>
                      <p className="caption mt-0.5">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
