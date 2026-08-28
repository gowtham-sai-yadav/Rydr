"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BestEffortOut } from "@/lib/api.types";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function BestEffortsPanel({ userId }: { userId: string }) {
  const [efforts, setEfforts] = useState<BestEffortOut[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getBestEfforts(userId)
      .then((res) => setEfforts(res.efforts))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [userId]);

  if (error) return <p className="text-accent-red text-sm">{error}</p>;

  if (efforts === null) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (efforts.length === 0) {
    return <p className="text-mute text-sm">Ride the same published route twice to set a best effort.</p>;
  }

  return (
    <div className="space-y-2">
      {efforts.map((e) => (
        <div key={e.route_id} className="flex items-center justify-between gap-3 border-b border-hairline-strong last:border-0 pb-2 last:pb-0">
          <div className="min-w-0">
            <p className="text-ink text-sm font-semibold truncate">{e.route_name || e.destination_name || "Route"}</p>
            <p className="text-mute text-xs">{e.attempt_count} attempt{e.attempt_count === 1 ? "" : "s"}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-accent-gold text-sm font-bold">{formatDuration(e.best_moving_duration_seconds)}</p>
            {e.best_avg_speed_kmh != null && <p className="text-mute text-xs">{e.best_avg_speed_kmh.toFixed(0)} km/h avg</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
