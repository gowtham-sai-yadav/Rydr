"use client";
import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { EventOut, EventRSVPOut, RSVPStatus } from "@/lib/api.types";
import Avatar from "@/components/ui/Avatar";

const RSVP_OPTIONS: { value: RSVPStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "interested", label: "Interested" },
  { value: "not_going", label: "Can't go" },
];

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [event, setEvent] = useState<EventOut | null>(null);
  const [rsvps, setRsvps] = useState<EventRSVPOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [e, r] = await Promise.all([api.getEvent(id), api.listEventRsvps(id)]);
      setEvent(e);
      setRsvps(r.rsvps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRsvp = async (status: RSVPStatus) => {
    setBusy(true);
    setError("");
    try {
      await api.setEventRsvp(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to RSVP");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!event) {
    return <div className="text-center py-12 text-mute">{error || "Event not found"}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="bg-surface-card rounded-xl p-6 space-y-2">
        <h1 className="text-2xl font-bold text-ink">{event.title}</h1>
        <p className="text-mute text-sm">{new Date(event.event_date).toLocaleString()}</p>
        {event.meeting_point && <p className="text-body text-sm">Meeting at {event.meeting_point}</p>}
        {event.description && <p className="text-body text-sm mt-2 whitespace-pre-wrap">{event.description}</p>}
        <p className="text-xs text-mute pt-2">
          {event.going_count} going · {event.interested_count} interested
        </p>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      <div className="flex gap-2">
        {RSVP_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleRsvp(opt.value)}
            disabled={busy}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${
              event.my_rsvp === opt.value ? "bg-accent-gold text-canvas" : "bg-surface-card text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-ink">Attendees</h2>
        {rsvps.filter((r) => r.status === "going").length === 0 ? (
          <p className="text-mute text-sm">No one&apos;s RSVP&apos;d going yet.</p>
        ) : (
          rsvps
            .filter((r) => r.status === "going")
            .map((r) => (
              <Link
                key={r.user.id}
                href={`/users/${r.user.id}`}
                className="flex items-center gap-3 bg-surface-card rounded-lg px-4 py-2.5 hover:bg-surface-elevated/40"
              >
                <Avatar
                  name={r.user.name}
                  avatarUrl={r.user.avatar_url}
                  size="xs"
                />
                <span className="text-ink text-sm">{r.user.name}</span>
              </Link>
            ))
        )}
      </div>
    </div>
  );
}
