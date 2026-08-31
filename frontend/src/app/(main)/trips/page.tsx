"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { TripOut } from "@/lib/api.types";

export default function TripsPage() {
  const [trips, setTrips] = useState<TripOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api
      .listMyTrips()
      .then((res) => setTrips(res.trips))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trips"))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.createTrip({ name: name.trim(), description: description || null });
      setName("");
      setDescription("");
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">My Trips</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn btn-primary h-10 px-5 rounded-xl text-xs font-semibold uppercase tracking-wider"
        >
          {creating ? "Cancel" : "New trip"}
        </button>
      </div>

      {creating && (
        <div className="bg-surface-card rounded-xl p-6 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Trip name, e.g. Ladakh 2026"
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={submitting || !name.trim()}
            className="bg-accent-gold text-canvas disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            {submitting ? "Creating…" : "Create trip"}
          </button>
        </div>
      )}

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : trips.length === 0 ? (
        <p className="text-mute text-sm text-center py-12">No trips yet — group a few logged rides into your first multi-day tour.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {trips.map((trip) => (
            <Link key={trip.id} href={`/trips/${trip.id}`} className="block bg-surface-card rounded-xl p-5 hover:bg-surface-elevated/40 transition-colors">
              <h2 className="text-ink font-bold">{trip.name}</h2>
              {trip.description && <p className="text-mute text-sm mt-1 line-clamp-2">{trip.description}</p>}
              <p className="text-xs text-mute pt-3">
                {trip.total_days} day{trip.total_days === 1 ? "" : "s"} · {trip.total_distance_km.toFixed(0)} km
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
