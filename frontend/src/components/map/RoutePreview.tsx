"use client";
/**
 * Route preview from the rider's home to a destination — Phase 4 W2.
 *
 * The honesty requirement here is the whole point of the component. The
 * backend returns `is_estimate: true` when the router was unreachable, in
 * which case the distance is a straight line inflated for road winding and
 * there is no geometry. This renders that case as an explicit approximation
 * rather than showing the same confident number as a real road route.
 */
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import type { DirectionsOut } from "@/lib/api.types";

type Props = {
  destinationId: string;
  origin: [number, number] | null;
  destinationName: string;
};

function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes < 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export default function RoutePreview({
  destinationId,
  origin,
  destinationName,
}: Props) {
  const [route, setRoute] = useState<DirectionsOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!origin) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .getRouteToDestination(destinationId, origin)
      .then((r) => !cancelled && setRoute(r))
      .catch((e) =>
        !cancelled &&
        setError(e instanceof Error ? e.message : "Could not load the route")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [destinationId, origin]);

  // No home location means no origin to route from. Prompt rather than
  // showing an empty panel or a zero.
  if (!origin) {
    return (
      <div className="bg-surface-card rounded-xl p-4">
        <h2 className="text-sm font-semibold text-ink mb-1">Route</h2>
        <p className="text-[13px] text-mute">
          Set your home location on your{" "}
          <a href="/profile" className="text-link hover:underline">
            profile
          </a>{" "}
          to see the ride out to {destinationName}.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface-card rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-ink">Route</h2>
        {route && (
          <span className="text-[11px] uppercase tracking-wide text-stone">
            {route.is_estimate ? "Approximate" : route.provider}
          </span>
        )}
      </div>

      {loading && <p className="text-[13px] text-mute">Working out the route…</p>}

      {error && !loading && (
        <p className="text-[13px] text-accent-red">{error}</p>
      )}

      {route && !loading && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-mute">
                Distance
              </p>
              <p className="text-xl font-semibold text-ink">
                {route.distance_km} km
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-mute">
                Riding time
              </p>
              <p className="text-xl font-semibold text-ink">
                {formatDuration(route.duration_minutes)}
              </p>
            </div>
          </div>

          {route.is_estimate ? (
            // Not a soft caveat: without this the number reads as a measured
            // road distance when it is a straight line with a winding factor.
            <p className="mt-3 text-[12px] text-accent-yellow">
              Routing is unavailable right now, so this is a straight-line
              estimate rather than a road route.
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-mute">
              One way, by road, from your home location.
            </p>
          )}
        </>
      )}
    </div>
  );
}
