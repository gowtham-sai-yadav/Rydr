"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { EventOut } from "@/lib/api.types";

export default function EventsPage() {
  const [events, setEvents] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listEvents({ upcoming_only: true, limit: 50 });
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!title.trim() || !eventDate) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createEvent({
        title: title.trim(),
        description: description || null,
        event_date: new Date(eventDate).toISOString(),
        meeting_point: meetingPoint || null,
      });
      setTitle("");
      setDescription("");
      setEventDate("");
      setMeetingPoint("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Events</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn btn-primary h-10 px-5 rounded-xl text-xs font-semibold uppercase tracking-wider"
        >
          {creating ? "Cancel" : "Create event"}
        </button>
      </div>

      {creating && (
        <div className="bg-surface-card rounded-xl p-6 space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Event title"
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <input
            type="datetime-local"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <input
            value={meetingPoint}
            onChange={(e) => setMeetingPoint(e.target.value)}
            placeholder="Meeting point (optional)"
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details"
            rows={3}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={submitting || !title.trim() || !eventDate}
            className="bg-accent-gold text-canvas disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            {submitting ? "Creating…" : "Create event"}
          </button>
        </div>
      )}

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-mute text-sm text-center py-12">No upcoming events.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {events.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}`} className="block bg-surface-card rounded-xl p-5 space-y-1 hover:bg-surface-elevated/40">
              <h2 className="text-ink font-bold">{ev.title}</h2>
              <p className="text-mute text-xs">{new Date(ev.event_date).toLocaleString()}</p>
              {ev.meeting_point && <p className="text-body text-xs">at {ev.meeting_point}</p>}
              <p className="text-xs text-mute pt-1">
                {ev.going_count} going · {ev.interested_count} interested
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
