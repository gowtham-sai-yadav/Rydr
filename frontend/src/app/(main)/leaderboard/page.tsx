"use client";
/**
 * Leaderboards — Phase 4 W5.
 *
 * Three boards: riders and destinations (both period-filtered, backed by
 * GET /api/leaderboards/{riders,destinations}?period=), and the Weekly
 * League (gold/silver/bronze tiers by this week's tracked distance, backed
 * by GET /api/leaderboards/weekly-league — always this week, no period
 * selector).
 *
 * Readable logged out — a leaderboard nobody can see until they sign up is
 * not much of a hook — but `my_rank` only appears when authenticated.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  DestinationLeaderboardEntry,
  LeaderboardPeriod,
  RiderLeaderboardEntry,
  WeeklyLeagueTier,
} from "@/lib/api.types";
import { routes } from "@/lib/routes";

type Tab = "riders" | "destinations" | "league";

const PERIODS: { value: LeaderboardPeriod; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
];

const TIER_STYLES: Record<string, string> = {
  gold: "text-accent-gold border-accent-gold/40 bg-accent-gold/10",
  silver: "text-stone-300 border-stone-400/40 bg-stone-400/10",
  bronze: "text-amber-600 border-amber-700/40 bg-amber-700/10",
};

const MEDAL_TEXT: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("riders");
  const [period, setPeriod] = useState<LeaderboardPeriod>("month");

  const [riders, setRiders] = useState<RiderLeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [destinations, setDestinations] = useState<DestinationLeaderboardEntry[]>([]);
  const [leagueTiers, setLeagueTiers] = useState<WeeklyLeagueTier[] | null>(null);
  const [weekStart, setWeekStart] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (t: Tab, p: LeaderboardPeriod) => {
    setLoading(true);
    setError("");
    try {
      if (t === "riders") {
        const res = await api.getRiderLeaderboard(p, 50);
        setRiders(res.entries);
        setMyRank(res.my_rank);
      } else if (t === "destinations") {
        const res = await api.getDestinationLeaderboard(p, 50);
        setDestinations(res.entries);
      } else {
        const res = await api.getWeeklyLeague();
        setLeagueTiers(res.tiers);
        setWeekStart(res.week_start);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(tab, period);
  }, [tab, period, load]);

  // Podium (top 3, ordered 2-1-3) + the rest, for the riders/destinations tabs.
  const top3Riders = riders.slice(0, 3);
  const otherRiders = riders.slice(3);
  const ridersPodium = top3Riders.length > 0
    ? [
        top3Riders.find((r) => r.rank === 2),
        top3Riders.find((r) => r.rank === 1),
        top3Riders.find((r) => r.rank === 3),
      ].filter((r): r is RiderLeaderboardEntry => !!r)
    : [];

  const top3Dests = destinations.slice(0, 3);
  const otherDests = destinations.slice(3);
  const destsPodium = top3Dests.length > 0
    ? [
        top3Dests.find((d) => d.rank === 2),
        top3Dests.find((d) => d.rank === 1),
        top3Dests.find((d) => d.rank === 3),
      ].filter((d): d is DestinationLeaderboardEntry => !!d)
    : [];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 relative glow-orange">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">
          Leaderboard
        </h1>

        {/* Tab triggers */}
        <div
          className="flex gap-1.5 bg-surface-card/40 border border-hairline-strong p-1 rounded-xl"
          role="tablist"
          aria-label="Leaderboard category"
        >
          {(["riders", "destinations", "league"] as Tab[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
                tab === t
                  ? "bg-accent-gold text-canvas shadow-lg shadow-accent-gold/15"
                  : "text-mute hover:text-ink"
              }`}
            >
              {t === "riders" ? "Riders" : t === "destinations" ? "Destinations" : "Weekly League"}
            </button>
          ))}
        </div>
      </div>

      {tab !== "league" && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}
            aria-label="Period"
            className="select text-xs py-1.5"
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {tab === "riders" && user && myRank != null && (
            <span className="text-[13px] text-mute ml-auto">You&apos;re #{myRank}</span>
          )}
        </div>
      )}

      {error && (
        <p className="text-[13px] text-accent-red bg-surface-card rounded-lg p-3">{error}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-8">
          {/* Riders */}
          {tab === "riders" && (
            riders.length === 0 ? (
              <p className="caption">No ride logs recorded for this period.</p>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto items-end pt-8 select-none">
                  {ridersPodium.map((entry) => {
                    const isGold = entry.rank === 1;
                    const isSilver = entry.rank === 2;
                    const isMe = !!user && entry.user_id === user.id;

                    return (
                      <motion.div
                        key={entry.user_id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative flex flex-col items-center justify-end ${
                          isGold ? "h-64 z-10" : isSilver ? "h-52" : "h-48"
                        }`}
                      >
                        <Link
                          href={routes.user(entry.user_id)}
                          className="group flex flex-col items-center text-center space-y-2 mb-3"
                        >
                          <div
                            className={`relative rounded-full p-[2.5px] transition-transform duration-300 group-hover:scale-105 ${
                              isGold
                                ? "bg-gradient-to-tr from-accent-gold via-accent-orange to-accent-blue shadow-lg shadow-accent-gold/10"
                                : isSilver
                                  ? "bg-stone-400"
                                  : "bg-amber-700"
                            }`}
                          >
                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-deep overflow-hidden flex items-center justify-center font-bold text-ink text-sm sm:text-base uppercase">
                              {entry.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                entry.name.charAt(0)
                              )}
                            </div>
                            <span
                              className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-md ${
                                isGold
                                  ? "bg-accent-gold text-canvas border-accent-gold-strong"
                                  : isSilver
                                    ? "bg-stone-500 text-ink border-stone-600"
                                    : "bg-amber-800 text-ink border-amber-900"
                              }`}
                            >
                              {MEDAL_TEXT[entry.rank]}
                            </span>
                          </div>
                          <div className="min-w-0 px-1">
                            <p className="text-ink text-xs font-bold truncate group-hover:text-accent-gold transition-colors duration-200">
                              {entry.name}
                            </p>
                            {isMe && (
                              <p className="text-[9px] text-accent-gold font-bold uppercase tracking-widest mt-0.5">
                                YOU
                              </p>
                            )}
                          </div>
                        </Link>

                        <div
                          className={`w-full rounded-t-xl border border-b-0 border-hairline-strong p-3 text-center flex flex-col justify-end ${
                            isGold
                              ? "h-32 bg-surface-card/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                              : isSilver
                                ? "h-24 bg-surface-card/30"
                                : "h-20 bg-surface-card/20"
                          }`}
                        >
                          <p className="text-xs font-bold text-mute uppercase tracking-wider">
                            {entry.estimated_distance_km} km
                          </p>
                          <p className="text-[10px] text-stone">{entry.rides} rides</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {otherRiders.length > 0 && (
                  <div className="max-w-2xl mx-auto card-bordered p-4 bg-surface-card/25 backdrop-blur-md rounded-2xl border border-hairline-strong shadow-lg">
                    <ol className="divide-y divide-hairline">
                      {otherRiders.map((entry) => {
                        const isMe = !!user && entry.user_id === user.id;
                        return (
                          <li key={entry.user_id} className="py-2.5 first:pt-0 last:pb-0">
                            <Link
                              href={routes.user(entry.user_id)}
                              className={`flex items-center gap-3 rounded-xl px-4 py-2 hover:bg-surface-elevated/40 transition-colors ${
                                isMe ? "bg-surface-elevated/60 border border-hairline-strong" : ""
                              }`}
                            >
                              <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                                #{entry.rank}
                              </span>
                              <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                                {entry.avatar_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={entry.avatar_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  entry.name.charAt(0)
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-ink text-sm font-semibold truncate">
                                  {entry.name}
                                  {isMe && (
                                    <span className="text-accent-gold text-xs font-semibold tracking-wide uppercase ml-1.5">
                                      (YOU)
                                    </span>
                                  )}
                                </p>
                              </div>
                              <span className="mono text-xs font-bold text-stone uppercase shrink-0">
                                {entry.estimated_distance_km} km · {entry.rides} rides
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                )}

                <p className="text-[11px] text-stone text-center max-w-2xl mx-auto">
                  Distance is estimated from each rider&apos;s home location to the
                  destination and back — Rydr does not record a GPS track. Riders
                  without a home location set still appear, with their ride count.
                </p>
              </div>
            )
          )}

          {/* Destinations */}
          {tab === "destinations" && (
            destinations.length === 0 ? (
              <p className="caption">No ride statistics compiled for this period.</p>
            ) : (
              <div className="space-y-8">
                <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto items-end pt-8 select-none">
                  {destsPodium.map((entry) => {
                    const isGold = entry.rank === 1;
                    const isSilver = entry.rank === 2;

                    return (
                      <motion.div
                        key={entry.destination_id}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`relative flex flex-col items-center justify-end ${
                          isGold ? "h-64 z-10" : isSilver ? "h-52" : "h-48"
                        }`}
                      >
                        <Link
                          href={routes.destination(entry.destination_id)}
                          className="group flex flex-col items-center text-center space-y-2 mb-3"
                        >
                          <div
                            className={`relative rounded-full p-[2.5px] transition-transform duration-300 group-hover:scale-105 ${
                              isGold
                                ? "bg-gradient-to-tr from-accent-gold via-accent-orange to-accent-blue shadow-lg shadow-accent-gold/10"
                                : isSilver
                                  ? "bg-stone-400"
                                  : "bg-amber-700"
                            }`}
                          >
                            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-deep overflow-hidden flex items-center justify-center font-bold text-ink text-sm sm:text-base uppercase">
                              {entry.hero_media_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={entry.hero_media_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                entry.name.charAt(0)
                              )}
                            </div>
                            <span
                              className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-md ${
                                isGold
                                  ? "bg-accent-gold text-canvas border-accent-gold-strong"
                                  : isSilver
                                    ? "bg-stone-500 text-ink border-stone-600"
                                    : "bg-amber-800 text-ink border-amber-900"
                              }`}
                            >
                              {MEDAL_TEXT[entry.rank]}
                            </span>
                          </div>
                          <div className="min-w-0 px-1">
                            <p className="text-ink text-xs font-bold truncate group-hover:text-accent-gold transition-colors duration-200">
                              {entry.name}
                            </p>
                          </div>
                        </Link>

                        <div
                          className={`w-full rounded-t-xl border border-b-0 border-hairline-strong p-3 text-center flex flex-col justify-end ${
                            isGold
                              ? "h-32 bg-surface-card/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                              : isSilver
                                ? "h-24 bg-surface-card/30"
                                : "h-20 bg-surface-card/20"
                          }`}
                        >
                          <p className="text-xs font-bold text-mute uppercase tracking-wider">
                            {entry.ride_count} rides
                          </p>
                          <p className="text-[10px] text-stone">{entry.unique_riders} riders</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {otherDests.length > 0 && (
                  <div className="max-w-2xl mx-auto card-bordered p-4 bg-surface-card/25 backdrop-blur-md rounded-2xl border border-hairline-strong shadow-lg">
                    <ol className="divide-y divide-hairline">
                      {otherDests.map((entry) => (
                        <li key={entry.destination_id} className="py-2.5 first:pt-0 last:pb-0">
                          <Link
                            href={routes.destination(entry.destination_id)}
                            className="flex items-center gap-3 rounded-xl px-4 py-2 hover:bg-surface-elevated/40 transition-colors"
                          >
                            <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                              #{entry.rank}
                            </span>
                            <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                              {entry.hero_media_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={entry.hero_media_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                entry.name.charAt(0)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-ink text-sm font-semibold truncate">{entry.name}</p>
                              <p className="text-stone text-[11px] truncate">
                                {entry.region ?? "—"} · ★ {entry.avg_rating.toFixed(1)}
                              </p>
                            </div>
                            <span className="mono text-xs font-bold text-stone uppercase shrink-0">
                              {entry.ride_count} rides · {entry.unique_riders} riders
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )
          )}

          {/* Weekly League */}
          {tab === "league" && (
            !leagueTiers || leagueTiers.length === 0 ? (
              <p className="caption">No one&apos;s logged a distance-tracked ride this week yet.</p>
            ) : (
              <div className="max-w-2xl mx-auto space-y-3">
                <p className="caption tracking-wide text-center">
                  Gold / Silver / Bronze by distance ridden this week{weekStart ? ` (since ${weekStart})` : ""}
                </p>
                {(["gold", "silver", "bronze"] as const).map((tierName) => {
                  const rows = leagueTiers.filter((t) => t.tier === tierName);
                  if (rows.length === 0) return null;
                  return (
                    <div key={tierName} className={`card-bordered rounded-2xl border p-4 ${TIER_STYLES[tierName]}`}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-2">{tierName}</p>
                      <ol className="divide-y divide-hairline">
                        {rows.map((entry) => {
                          const isMe = !!user && entry.user.id === user.id;
                          return (
                            <li key={entry.user.id} className="py-2 first:pt-0 last:pb-0">
                              <Link
                                href={routes.user(entry.user.id)}
                                className={`flex items-center gap-3 rounded-xl px-3 py-1.5 hover:bg-surface-elevated/40 transition-colors ${
                                  isMe ? "bg-surface-elevated/60 border border-hairline-strong" : ""
                                }`}
                              >
                                <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                                  #{entry.rank}
                                </span>
                                <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong overflow-hidden flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                                  {entry.user.avatar_url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={entry.user.avatar_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    entry.user.name.charAt(0)
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-ink text-sm font-semibold truncate">
                                    {entry.user.name}
                                    {isMe && (
                                      <span className="text-accent-gold text-xs font-semibold tracking-wide uppercase ml-1.5">
                                        (YOU)
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <span className="mono text-xs font-bold text-stone uppercase shrink-0">
                                  {entry.distance_km.toFixed(0)} km
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
