"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { YearInRydrOut } from "@/lib/api.types";

const CURRENT_YEAR = new Date().getFullYear();

export default function YearInRydrPage() {
  const { user } = useAuth();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [recap, setRecap] = useState<YearInRydrOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api
      .getYearInRydr(user.id, year)
      .then(setRecap)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recap"))
      .finally(() => setLoading(false));
  }, [user, year]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">
          Year in Rydr
        </h1>
        <div className="flex gap-1.5">
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                year === y ? "bg-accent-gold text-canvas" : "bg-surface-card text-mute"
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {recap && recap.total_rides === 0 ? (
        <p className="text-mute text-sm text-center py-12">No tracked rides in {year} yet.</p>
      ) : recap ? (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl p-8 text-center bg-gradient-to-br from-accent-gold/20 via-accent-orange/10 to-transparent border border-accent-gold/30">
            <p className="text-6xl font-black text-accent-gold">{recap.total_distance_km.toFixed(0)}</p>
            <p className="text-mute text-sm uppercase tracking-wider mt-1">Kilometers ridden in {recap.year}</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="Rides logged" value={recap.total_rides} />
            <Stat label="Elevation gained" value={`${recap.total_elevation_gain_m.toFixed(0)} m`} />
            <Stat label="Time in the saddle" value={`${recap.total_moving_hours.toFixed(0)} h`} />
            <Stat label="Longest ride" value={recap.longest_ride_km ? `${recap.longest_ride_km.toFixed(0)} km` : "—"} />
            <Stat label="Destinations visited" value={recap.distinct_destinations} />
            <Stat label="Badges earned" value={recap.badges_earned} />
            <Stat label="Active months" value={`${recap.active_months} / 12`} />
          </div>

          {recap.top_destination && (
            <Link
              href={`/destinations/${recap.top_destination.destination_id}`}
              className="block bg-surface-card rounded-xl p-6 hover:bg-surface-elevated/40 transition-colors"
            >
              <p className="text-xs text-mute uppercase tracking-wide">Most visited destination</p>
              <p className="text-ink font-bold text-lg mt-1">{recap.top_destination.name}</p>
              <p className="text-mute text-sm">{recap.top_destination.ride_count} rides</p>
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-card rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-mute uppercase tracking-wide mt-1">{label}</p>
    </div>
  );
}
