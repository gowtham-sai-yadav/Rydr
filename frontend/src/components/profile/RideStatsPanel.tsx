"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MineRideOut } from "@/lib/api.types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function startOfWeek(d: Date): number {
  const day = d.getDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(d.getDate() - diff);
  return monday.getTime();
}

/**
 * Computes weekly/monthly ride counts and a week-over-week streak entirely
 * client-side from the rides the caller has already been on. There is no
 * distance field anywhere in the ride/ride-log schema (RidePlanOut,
 * RideLogOut) — nothing captures route length — so "distance ridden" is
 * left out rather than invented; ride counts and a completion streak are
 * shown instead.
 */
export function RideStatsPanel() {
  const [rides, setRides] = useState<MineRideOut[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getMyRides({ status: "completed", include_left: false, limit: 100 })
      .then((res) => setRides(res.rides))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load ride history"));
  }, []);

  if (error) {
    return <p className="text-accent-red text-sm">{error}</p>;
  }

  if (rides === null) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  const now = Date.now();
  const completedDates = rides
    .map((r) => new Date(r.planned_date + "T00:00:00").getTime())
    .filter((t) => !Number.isNaN(t));

  const ridesThisWeek = completedDates.filter((t) => now - t <= MS_PER_WEEK && t <= now).length;
  const ridesThisMonth = completedDates.filter((t) => now - t <= 30 * MS_PER_DAY && t <= now).length;

  // Streak = consecutive weeks (ending this week) with at least one ride.
  const weeksWithRides = new Set(completedDates.map((t) => startOfWeek(new Date(t))));
  let streak = 0;
  let cursor = startOfWeek(new Date(now));
  while (weeksWithRides.has(cursor)) {
    streak += 1;
    cursor -= MS_PER_WEEK;
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="text-center">
        <p className="text-3xl font-bold text-accent-orange">{ridesThisWeek}</p>
        <p className="text-xs text-mute uppercase mt-1">This week</p>
      </div>
      <div className="text-center">
        <p className="text-3xl font-bold text-accent-orange">{ridesThisMonth}</p>
        <p className="text-xs text-mute uppercase mt-1">This month</p>
      </div>
      <div className="text-center">
        <p className="text-3xl font-bold text-accent-orange">{streak}</p>
        <p className="text-xs text-mute uppercase mt-1">Week streak</p>
      </div>
    </div>
  );
}
