"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PersonalRecordsOut } from "@/lib/api.types";

export function PersonalRecordsPanel({ userId }: { userId: string }) {
  const [records, setRecords] = useState<PersonalRecordsOut | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getPersonalRecords(userId)
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load records"));
  }, [userId]);

  if (error) return <p className="text-accent-red text-sm">{error}</p>;

  if (records === null) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  const hasAny = records.longest_ride || records.best_month || records.most_destinations_in_a_week;
  if (!hasAny) {
    return <p className="text-mute text-sm">Log a few rides to start setting records.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {records.longest_ride && (
        <div className="text-center">
          <p className="text-2xl font-bold text-accent-gold">{records.longest_ride.distance_km.toFixed(1)} km</p>
          <p className="text-xs text-mute uppercase mt-1">Longest ride</p>
          {records.longest_ride.destination_name && (
            <p className="text-xs text-mute mt-0.5">{records.longest_ride.destination_name}</p>
          )}
        </div>
      )}
      {records.best_month && (
        <div className="text-center">
          <p className="text-2xl font-bold text-accent-gold">{records.best_month.total_distance_km.toFixed(0)} km</p>
          <p className="text-xs text-mute uppercase mt-1">Best month</p>
          <p className="text-xs text-mute mt-0.5">{records.best_month.ride_count} rides</p>
        </div>
      )}
      {records.most_destinations_in_a_week && (
        <div className="text-center">
          <p className="text-2xl font-bold text-accent-gold">{records.most_destinations_in_a_week.destination_count}</p>
          <p className="text-xs text-mute uppercase mt-1">Best week (destinations)</p>
        </div>
      )}
    </div>
  );
}
