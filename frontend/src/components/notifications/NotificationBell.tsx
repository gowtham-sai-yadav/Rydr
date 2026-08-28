"use client";
/**
 * Notification bell and dropdown — Phase 4 W5.
 *
 * Polls the unread count rather than holding a socket open. The chat
 * WebSocket exists because chat needs sub-second delivery; a notification
 * badge does not, and a second persistent connection per tab would cost the
 * single-worker backend real capacity for a number that can be a minute
 * stale without anyone noticing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { api } from "@/lib/api";
import type { NotificationOut } from "@/lib/api.types";
import { routes } from "@/lib/routes";

const POLL_MS = 60_000;

/** Where a notification should take you, by what it points at. */
function targetHref(n: NotificationOut): string | null {
  if (!n.entity_id) return null;
  switch (n.entity_type) {
    case "ride":
      return routes.ride(n.entity_id);
    case "chat_group":
      return routes.chatRoom(n.entity_id);
    case "destination":
      return routes.destination(n.entity_id);
    case "user":
      return routes.user(n.entity_id);
    case "badge":
      return "/profile";
    case "post":
      // No single-post route yet; the feed is the closest useful place.
      return "/feed";
    case "report":
      return null;
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationOut[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await api.getUnreadCount();
      setUnread(res.unread);
    } catch {
      // A failed poll is not worth telling the user about; the next one may
      // succeed, and a badge that shows an error is worse than a stale badge.
    }
  }, []);

  useEffect(() => {
    void refreshCount();
    const timer = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(timer);
  }, [refreshCount]);

  // Close on outside click and on Escape — a dropdown that only closes by
  // clicking the trigger again is a trap on mobile.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      const res = await api.listNotifications({ limit: 15 });
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(n: NotificationOut) {
    if (n.read_at) return;
    // Optimistic: the row dims immediately. Opening a notification and
    // watching it stay bold for a round trip reads as a failed tap.
    setItems((list) =>
      list.map((x) =>
        x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x
      )
    );
    setUnread((u) => Math.max(0, u - 1));
    try {
      await api.markNotificationRead(n.id);
    } catch {
      void refreshCount();
    }
  }

  async function markAll() {
    setItems((list) =>
      list.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() }))
    );
    setUnread(0);
    try {
      await api.markAllNotificationsRead();
    } catch {
      void refreshCount();
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        aria-label={
          unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
        }
        aria-expanded={open}
        className="relative p-1.5 text-charcoal hover:text-ink transition-colors"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-orange text-canvas text-[10px] font-semibold flex items-center justify-center">
            {/* Capped: a three-digit badge blows out the header layout. */}
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-elevated border border-hairline rounded-xl shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-hairline">
            <span className="text-[13px] font-semibold text-ink">
              Notifications
            </span>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-[12px] text-link hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-hairline">
            {loading && (
              <p className="px-4 py-6 text-[13px] text-mute text-center">
                Loading…
              </p>
            )}

            {!loading && items.length === 0 && (
              <p className="px-4 py-8 text-[13px] text-mute text-center">
                Nothing yet. Join a ride and this fills up.
              </p>
            )}

            {items.map((n) => {
              const href = targetHref(n);
              const body = (
                <div
                  className={`px-4 py-3 ${
                    n.read_at ? "opacity-60" : "bg-surface-card/40"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && (
                      <span
                        className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-orange shrink-0"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] text-ink leading-snug">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-[12px] text-mute truncate">{n.body}</p>
                      )}
                      <p className="text-[11px] text-stone mt-0.5">
                        {relativeTime(n.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );

              return href ? (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => {
                    void markRead(n);
                    setOpen(false);
                  }}
                  className="block hover:bg-surface-card transition-colors"
                >
                  {body}
                </Link>
              ) : (
                // Notifications whose target has no route (or was deleted)
                // stay readable and dismissible, just not clickable.
                <button
                  key={n.id}
                  onClick={() => void markRead(n)}
                  className="block w-full text-left hover:bg-surface-card transition-colors"
                >
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
