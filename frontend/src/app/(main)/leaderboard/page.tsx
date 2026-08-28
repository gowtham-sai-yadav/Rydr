"use client";
/**
 * Leaderboards — Phase 4 W5.
 *
 * Two boards on one page: riders by estimated distance, and destinations by
 * how often they were ridden. Period tabs default to "month", matching the
 * plan's "most-ridden this month" framing.
 *
 * Readable logged out — a leaderboard nobody can see until they sign up is
 * not much of a hook — but `my_rank` only appears when authenticated.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  DestinationLeaderboardEntry,
  LeaderboardPeriod,
  RiderLeaderboardEntry,
} from "@/lib/api.types";

type Board = "riders" | "destinations";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

function medal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return String(rank);
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<Board>("riders");
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");
  const [riders, setRiders] = useState<RiderLeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [destinations, setDestinations] = useState<
    DestinationLeaderboardEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (b: Board, p: LeaderboardPeriod) => {
    setLoading(true);
    setError("");
    try {
      if (b === "riders") {
        const res = await api.getRiderLeaderboard(p, 50);
        setRiders(res.entries);
        setMyRank(res.my_rank);
      } else {
        const res = await api.getDestinationLeaderboard(p, 50);
        setDestinations(res.entries);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(board, period);
  }, [board, period, load]);

  const entries = board === "riders" ? riders : destinations;

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12 glow-orange">
      <h1 className="text-2xl font-bold text-ink">Leaderboard</h1>

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Leaderboard type"
          className="flex rounded-lg bg-surface-card border border-hairline p-0.5"
        >
          {(["riders", "destinations"] as Board[]).map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={board === b}
              onClick={() => setBoard(b)}
              className={`px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-colors ${
                board === b
                  ? "bg-surface-elevated text-ink"
                  : "text-charcoal hover:text-ink"
              }`}
            >
              {b}
            </button>
          ))}
        </div>

        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}
          aria-label="Period"
          className="bg-surface-card border border-hairline rounded-lg px-3 py-1.5 text-[13px] text-ink"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {board === "riders" && user && myRank != null && (
          <span className="text-[13px] text-mute ml-auto">
            You&apos;re #{myRank}
          </span>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-accent-red bg-surface-card rounded-lg p-3">
          {error}
        </p>
      )}

      {loading && (
        <div className="bg-surface-card rounded-xl p-6" role="status">
          <p className="text-[13px] text-mute">Loading…</p>
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="bg-surface-card rounded-xl p-8 text-center">
          <p className="text-ink font-medium">Nothing here yet</p>
          <p className="text-[13px] text-mute mt-1">
            Only completed rides count. Log a ride and it&apos;ll show up.
          </p>
        </div>
      )}

      {!loading && board === "riders" && riders.length > 0 && (
        <ol className="bg-surface-card rounded-xl divide-y divide-hairline">
          {riders.map((r) => {
            const isMe = user?.id === r.user_id;
            return (
              <li
                key={r.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  isMe ? "bg-surface-elevated" : ""
                }`}
              >
                <span className="w-8 text-center text-[15px] text-charcoal shrink-0">
                  {medal(r.rank)}
                </span>
                <Link
                  href={`/users/${r.user_id}`}
                  className="flex items-center gap-3 min-w-0 flex-1"
                >
                  <span className="w-8 h-8 rounded-full bg-surface-elevated overflow-hidden flex items-center justify-center text-[12px] text-charcoal shrink-0">
                    {r.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      r.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <span className="text-[14px] text-ink truncate">
                    {r.name}
                    {isMe && <span className="text-mute"> (you)</span>}
                  </span>
                </Link>
                <div className="text-right shrink-0">
                  <p className="text-[14px] text-ink font-medium">
                    {r.estimated_distance_km} km
                  </p>
                  <p className="text-[11px] text-stone">
                    {r.rides} ride{r.rides === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!loading && board === "destinations" && destinations.length > 0 && (
        <ol className="bg-surface-card rounded-xl divide-y divide-hairline">
          {destinations.map((d) => (
            <li key={d.destination_id} className="flex items-center gap-3 px-4 py-3">
              <span className="w-8 text-center text-[15px] text-charcoal shrink-0">
                {medal(d.rank)}
              </span>
              <Link
                href={`/destinations/${d.destination_id}`}
                className="min-w-0 flex-1"
              >
                <p className="text-[14px] text-ink truncate">{d.name}</p>
                <p className="text-[11px] text-stone">
                  {d.region ?? "—"} · ★ {d.avg_rating.toFixed(1)}
                </p>
              </Link>
              <div className="text-right shrink-0">
                <p className="text-[14px] text-ink font-medium">
                  {d.ride_count} ride{d.ride_count === 1 ? "" : "s"}
                </p>
                {/* Distinct riders is the secondary ranking key, so it is worth
                    showing: it is what separates a place ten people ride from
                    one person's regular commute. */}
                <p className="text-[11px] text-stone">
                  {d.unique_riders} rider{d.unique_riders === 1 ? "" : "s"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {board === "riders" && (
        <p className="text-[11px] text-stone">
          Distance is estimated from each rider&apos;s home location to the
          destination and back — Rydr does not record a GPS track. Riders
          without a home location set still appear, with their ride count.
        </p>
      )}
    </div>
  );
}
