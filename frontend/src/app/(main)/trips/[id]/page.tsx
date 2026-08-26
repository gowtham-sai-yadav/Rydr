"use client";
import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { MyRideLogOut, TripOut } from "@/lib/api.types";

export default function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [trip, setTrip] = useState<TripOut | null>(null);
  const [myLogs, setMyLogs] = useState<MyRideLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState("");

  const load = useCallback(async () => {
    try {
      const [t, logs] = await Promise.all([api.getTrip(id), api.getMyRideLogs(100)]);
      setTrip(t);
      setMyLogs(logs.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const usedLogIds = new Set(trip?.days.map((d) => d.ride_log_id) ?? []);
  const availableLogs = myLogs.filter((l) => !usedLogIds.has(l.id));

  const handleAddDay = async () => {
    if (!selectedLogId || !trip) return;
    const nextDayIndex = trip.days.length > 0 ? Math.max(...trip.days.map((d) => d.day_index)) + 1 : 1;
    try {
      await api.addTripDay(id, { ride_log_id: selectedLogId, day_index: nextDayIndex });
      setSelectedLogId("");
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add day");
    }
  };

  const handleRemoveDay = async (rideLogId: string) => {
    try {
      await api.removeTripDay(id, rideLogId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove day");
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this trip? The ride logs themselves are untouched.")) return;
    try {
      await api.deleteTrip(id);
      router.push("/trips");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trip");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!trip) {
    return <div className="text-center py-12 text-mute">{error || "Trip not found"}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">{trip.name}</h1>
          {trip.description && <p className="text-mute text-sm mt-1">{trip.description}</p>}
          <p className="text-xs text-mute mt-2">
            {trip.total_days} day{trip.total_days === 1 ? "" : "s"} · {trip.total_distance_km.toFixed(0)} km total
          </p>
        </div>
        <button onClick={handleDelete} className="text-accent-red text-xs font-semibold uppercase tracking-wider">
          Delete
        </button>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      <div className="space-y-3">
        {trip.days
          .slice()
          .sort((a, b) => a.day_index - b.day_index)
          .map((day) => (
            <div key={day.ride_log_id} className="flex items-center gap-4 bg-surface-card rounded-xl p-4">
              {day.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={day.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-surface-deep shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-accent-gold font-bold uppercase tracking-wider">Day {day.day_index}</p>
                <Link href={`/rides/${day.ride_plan_id}/log`} className="text-ink font-semibold text-sm hover:text-accent-gold">
                  {day.destination_name || "Ride"}
                </Link>
                {day.distance_km != null && <p className="text-mute text-xs">{day.distance_km.toFixed(0)} km</p>}
              </div>
              <button onClick={() => handleRemoveDay(day.ride_log_id)} className="text-mute hover:text-accent-red text-xs">
                Remove
              </button>
            </div>
          ))}
      </div>

      {adding ? (
        <div className="bg-surface-card rounded-xl p-4 space-y-3">
          <select
            value={selectedLogId}
            onChange={(e) => setSelectedLogId(e.target.value)}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm"
          >
            <option value="">Select a logged ride…</option>
            {availableLogs.map((log) => (
              <option key={log.id} value={log.id}>
                {log.destination_name || "Ride"} {log.actual_start_ts ? `— ${new Date(log.actual_start_ts).toLocaleDateString()}` : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={handleAddDay}
              disabled={!selectedLogId}
              className="bg-accent-gold text-canvas disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold"
            >
              Add
            </button>
            <button onClick={() => setAdding(false)} className="text-mute text-sm px-4 py-2">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full border border-hairline-strong text-ink py-3 rounded-lg text-sm font-medium hover:bg-surface-elevated/40"
        >
          + Add a day
        </button>
      )}
    </div>
  );
}
