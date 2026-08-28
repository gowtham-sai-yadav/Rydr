"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ElevationProfileOut } from "@/lib/api.types";

const CHART_WIDTH = 600;
const CHART_HEIGHT = 120;
const PADDING = 8;

export function ElevationProfileChart({ routeId }: { routeId: string }) {
  const [profile, setProfile] = useState<ElevationProfileOut | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getElevationProfile(routeId)
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Elevation data unavailable"));
  }, [routeId]);

  if (error) return null; // non-critical - just skip the card entirely
  if (!profile) {
    return (
      <div className="bg-surface-card rounded-xl p-4 flex justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  const elevations = profile.points.map((p) => p.elevation_m);
  const minEl = Math.min(...elevations);
  const maxEl = Math.max(...elevations);
  const range = Math.max(maxEl - minEl, 1);
  const maxDist = Math.max(...profile.points.map((p) => p.distance_from_start_km), 1);

  const coords = profile.points.map((p) => {
    const x = PADDING + (p.distance_from_start_km / maxDist) * (CHART_WIDTH - PADDING * 2);
    const y = CHART_HEIGHT - PADDING - ((p.elevation_m - minEl) / range) * (CHART_HEIGHT - PADDING * 2);
    return { x, y, point: p };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x},${CHART_HEIGHT - PADDING} L${coords[0].x},${CHART_HEIGHT - PADDING} Z`;

  return (
    <div className="bg-surface-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Elevation Profile</h3>
        <p className="text-xs text-mute">
          <span className="text-accent-green">↑{profile.total_gain_m.toFixed(0)}m</span>{" "}
          <span className="text-accent-red">↓{profile.total_loss_m.toFixed(0)}m</span>
        </p>
      </div>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-24" preserveAspectRatio="none">
        <path d={areaPath} fill="var(--color-accent-gold)" fillOpacity={0.15} />
        <path d={linePath} fill="none" stroke="var(--color-accent-gold)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={3} fill="var(--color-accent-gold)" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-mute mt-1">
        {profile.points.map((p, i) => (
          <span key={i} className="truncate max-w-[80px]">{p.label || `Pt ${p.ordinal}`}</span>
        ))}
      </div>
    </div>
  );
}
