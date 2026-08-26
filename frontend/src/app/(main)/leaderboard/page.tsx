"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  DestinationLeaderboardEntry,
  RiderLeaderboardEntry,
} from "@/lib/api.types";

type Tab = "riders" | "destinations";

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [riders, setRiders] = useState<RiderLeaderboardEntry[] | null>(null);
  const [destinations, setDestinations] = useState<DestinationLeaderboardEntry[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("riders");

  useEffect(() => {
    Promise.all([api.getRiderLeaderboard(), api.getDestinationLeaderboard()])
      .then(([r, d]) => {
        setRiders(r.entries);
        setDestinations(d.entries);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load leaderboard"));
  }, []);

  const loading = riders === null && destinations === null && !error;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-12 text-mute">{error}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12 glow-yellow">
      <h1 className="display-lg">Leaderboard</h1>

      {/* Tabs on mobile, side-by-side on desktop */}
      <div className="flex gap-2 md:hidden">
        <button
          onClick={() => setTab("riders")}
          className={`chip ${tab === "riders" ? "chip-active" : ""}`}
        >
          Riders
        </button>
        <button
          onClick={() => setTab("destinations")}
          className={`chip ${tab === "destinations" ? "chip-active" : ""}`}
        >
          Destinations
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`space-y-3 ${tab === "riders" ? "" : "hidden md:block"}`}>
          <h2 className="heading-sm">Top riders</h2>
          <p className="caption">By ride logs posted, all time</p>
          {!riders || riders.length === 0 ? (
            <p className="caption">No ride data yet.</p>
          ) : (
            <ol className="space-y-2">
              {riders.map((entry) => {
                const isMe = !!user && entry.user.id === user.id;
                return (
                  <li key={entry.user.id}>
                    <Link
                      href={`/users/${entry.user.id}`}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                        isMe
                          ? "bg-surface-elevated ring-1 ring-hairline-strong"
                          : "hover:bg-surface-elevated/60"
                      }`}
                    >
                      <span className="mono text-mute w-6 text-right shrink-0">{entry.rank}</span>
                      <div className="w-8 h-8 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold shrink-0">
                        {entry.user.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink text-sm font-medium truncate">
                          {entry.user.name}
                          {isMe && <span className="text-mute font-normal"> (you)</span>}
                        </p>
                      </div>
                      <span className="mono text-sm text-ink shrink-0">
                        {entry.rides_logged} {entry.rides_logged === 1 ? "ride" : "rides"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className={`space-y-3 ${tab === "destinations" ? "" : "hidden md:block"}`}>
          <h2 className="heading-sm">Most ridden this month</h2>
          <p className="caption">Completed rides, calendar month to date</p>
          {!destinations || destinations.length === 0 ? (
            <p className="caption">No ride data yet.</p>
          ) : (
            <ol className="space-y-2">
              {destinations.map((entry) => (
                <li key={entry.destination_id}>
                  <Link
                    href={`/destinations/${entry.destination_id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-elevated/60 transition-colors"
                  >
                    <span className="mono text-mute w-6 text-right shrink-0">{entry.rank}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink text-sm font-medium truncate">{entry.destination_name}</p>
                    </div>
                    <span className="mono text-sm text-ink shrink-0">{entry.ride_count} rides</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
