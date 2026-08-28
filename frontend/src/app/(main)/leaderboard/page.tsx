"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  DestinationLeaderboardEntry,
  RiderLeaderboardEntry,
  WeeklyLeagueTier,
} from "@/lib/api.types";

type Tab = "riders" | "destinations" | "league";

const TIER_STYLES: Record<string, string> = {
  gold: "text-accent-gold border-accent-gold/40 bg-accent-gold/10",
  silver: "text-stone-300 border-stone-400/40 bg-stone-400/10",
  bronze: "text-amber-600 border-amber-700/40 bg-amber-700/10",
};

const MEDAL_TEXT: Record<number, string> = { 1: "1ST", 2: "2ND", 3: "3RD" };

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [riders, setRiders] = useState<RiderLeaderboardEntry[] | null>(null);
  const [destinations, setDestinations] = useState<DestinationLeaderboardEntry[] | null>(null);
  const [leagueTiers, setLeagueTiers] = useState<WeeklyLeagueTier[] | null>(null);
  const [weekStart, setWeekStart] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("riders");

  useEffect(() => {
    Promise.all([api.getRiderLeaderboard(), api.getDestinationLeaderboard(), api.getWeeklyLeague()])
      .then(([r, d, l]) => {
        setRiders(r.entries);
        setDestinations(d.entries);
        setLeagueTiers(l.tiers);
        setWeekStart(l.week_start);
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

  // Pre-process top 3 and others
  const top3Riders = riders ? riders.slice(0, 3) : [];
  const otherRiders = riders ? riders.slice(3) : [];
  const ridersPodium = top3Riders.length > 0 ? [
    top3Riders.find(r => r.rank === 2),
    top3Riders.find(r => r.rank === 1),
    top3Riders.find(r => r.rank === 3),
  ].filter((r): r is RiderLeaderboardEntry => !!r) : [];

  const top3Dests = destinations ? destinations.slice(0, 3) : [];
  const otherDests = destinations ? destinations.slice(3) : [];
  const destsPodium = top3Dests.length > 0 ? [
    top3Dests.find(d => d.rank === 2),
    top3Dests.find(d => d.rank === 1),
    top3Dests.find(d => d.rank === 3),
  ].filter((d): d is DestinationLeaderboardEntry => !!d) : [];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 relative">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Leaderboard</h1>
        
        {/* Tab triggers */}
        <div className="flex gap-1.5 bg-surface-card/40 border border-hairline-strong p-1 rounded-xl" role="tablist" aria-label="Leaderboard category">
          <button
            role="tab"
            aria-selected={tab === "riders"}
            onClick={() => setTab("riders")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              tab === "riders"
                ? "bg-accent-gold text-canvas shadow-lg shadow-accent-gold/15"
                : "text-mute hover:text-ink"
            }`}
          >
            Riders
          </button>
          <button
            role="tab"
            aria-selected={tab === "destinations"}
            onClick={() => setTab("destinations")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              tab === "destinations"
                ? "bg-accent-gold text-canvas shadow-lg shadow-accent-gold/15"
                : "text-mute hover:text-ink"
            }`}
          >
            Destinations
          </button>
          <button
            role="tab"
            aria-selected={tab === "league"}
            onClick={() => setTab("league")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-200 ${
              tab === "league"
                ? "bg-accent-gold text-canvas shadow-lg shadow-accent-gold/15"
                : "text-mute hover:text-ink"
            }`}
          >
            Weekly League
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Top Riders Category */}
        <div className={`space-y-6 ${tab === "riders" ? "" : "hidden"}`}>
          <div className="text-center sm:text-left">
            <h2 className="heading-md text-ink uppercase tracking-wider font-display">Top Riders</h2>
            <p className="caption tracking-wide mt-1">Based on logged rides, all time</p>
          </div>

          {!riders || riders.length === 0 ? (
            <p className="caption">No ride logs recorded.</p>
          ) : (
            <div className="space-y-8">
              {/* Podium display */}
              <div className="grid grid-cols-3 gap-3 max-w-2xl mx-auto items-end pt-8 select-none">
                {ridersPodium.map((entry) => {
                  const isGold = entry.rank === 1;
                  const isSilver = entry.rank === 2;
                  const isMe = !!user && entry.user.id === user.id;

                  return (
                    <motion.div
                      key={entry.user.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`relative flex flex-col items-center justify-end ${
                        isGold ? "h-64 z-10" : isSilver ? "h-52" : "h-48"
                      }`}
                    >
                      {/* Biker avatar and rank tag */}
                      <Link href={`/users/${entry.user.id}`} className="group flex flex-col items-center text-center space-y-2 mb-3">
                        <div className={`relative rounded-full p-[2.5px] transition-transform duration-300 group-hover:scale-105 ${
                          isGold ? "bg-gradient-to-tr from-accent-gold via-accent-orange to-accent-blue shadow-lg shadow-accent-gold/10" :
                          isSilver ? "bg-stone-400" : "bg-amber-700"
                        }`}>
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-deep flex items-center justify-center font-bold text-ink text-sm sm:text-base uppercase">
                            {entry.user.name.charAt(0)}
                          </div>
                          <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-md ${
                            isGold ? "bg-accent-gold text-canvas border-accent-gold-strong" :
                            isSilver ? "bg-stone-500 text-ink border-stone-600" : "bg-amber-800 text-ink border-amber-900"
                          }`}>
                            {MEDAL_TEXT[entry.rank]}
                          </span>
                        </div>
                        <div className="min-w-0 px-1">
                          <p className="text-ink text-xs font-bold truncate group-hover:text-accent-gold transition-colors duration-200">
                            {entry.user.name}
                          </p>
                          {isMe && <p className="text-[9px] text-accent-gold font-bold uppercase tracking-widest mt-0.5">YOU</p>}
                        </div>
                      </Link>

                      {/* Stand structure */}
                      <div className={`w-full rounded-t-xl border border-b-0 border-hairline-strong p-3 text-center flex flex-col justify-end ${
                        isGold ? "h-32 bg-surface-card/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" :
                        isSilver ? "h-24 bg-surface-card/30" : "h-20 bg-surface-card/20"
                      }`}>
                        <p className="text-xs font-bold text-mute uppercase tracking-wider">{entry.rides_logged} rides</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Lower list rankings (ranks 4+) */}
              {otherRiders.length > 0 && (
                <div className="max-w-2xl mx-auto card-bordered p-4 bg-surface-card/25 backdrop-blur-md rounded-2xl border border-hairline-strong shadow-lg">
                  <ol className="divide-y divide-hairline">
                    {otherRiders.map((entry) => {
                      const isMe = !!user && entry.user.id === user.id;
                      return (
                        <li key={entry.user.id} className="py-2.5 first:pt-0 last:pb-0">
                          <Link
                            href={`/users/${entry.user.id}`}
                            className={`flex items-center gap-3 rounded-xl px-4 py-2 hover:bg-surface-elevated/40 transition-colors ${
                              isMe ? "bg-surface-elevated/60 border border-hairline-strong" : ""
                            }`}
                          >
                            <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                              #{entry.rank}
                            </span>
                            <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                              {entry.user.name.charAt(0)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-ink text-sm font-semibold truncate">
                                {entry.user.name}
                                {isMe && <span className="text-accent-gold text-xs font-semibold tracking-wide uppercase ml-1.5">(YOU)</span>}
                              </p>
                            </div>
                            <span className="mono text-xs font-bold text-stone uppercase shrink-0">
                              {entry.rides_logged} rides
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Top Destinations Category */}
        <div className={`space-y-6 ${tab === "destinations" ? "" : "hidden"}`}>
          <div className="text-center sm:text-left">
            <h2 className="heading-md text-ink uppercase tracking-wider font-display">Most Visited Routes</h2>
            <p className="caption tracking-wide mt-1">Completed rides, calendar month to date</p>
          </div>

          {!destinations || destinations.length === 0 ? (
            <p className="caption">No route statistics compiled.</p>
          ) : (
            <div className="space-y-8">
              {/* Podium display */}
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
                      {/* Route avatar and rank tag */}
                      <Link href={`/destinations/${entry.destination_id}`} className="group flex flex-col items-center text-center space-y-2 mb-3">
                        <div className={`relative rounded-full p-[2.5px] transition-transform duration-300 group-hover:scale-105 ${
                          isGold ? "bg-gradient-to-tr from-accent-gold via-accent-orange to-accent-blue shadow-lg shadow-accent-gold/10" :
                          isSilver ? "bg-stone-400" : "bg-amber-700"
                        }`}>
                          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-surface-deep flex items-center justify-center font-bold text-ink text-sm sm:text-base uppercase">
                            {entry.destination_name.charAt(0)}
                          </div>
                          <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full border shadow-md ${
                            isGold ? "bg-accent-gold text-canvas border-accent-gold-strong" :
                            isSilver ? "bg-stone-500 text-ink border-stone-600" : "bg-amber-800 text-ink border-amber-900"
                          }`}>
                            {MEDAL_TEXT[entry.rank]}
                          </span>
                        </div>
                        <div className="min-w-0 px-1">
                          <p className="text-ink text-xs font-bold truncate group-hover:text-accent-gold transition-colors duration-200">
                            {entry.destination_name}
                          </p>
                        </div>
                      </Link>

                      {/* Stand structure */}
                      <div className={`w-full rounded-t-xl border border-b-0 border-hairline-strong p-3 text-center flex flex-col justify-end ${
                        isGold ? "h-32 bg-surface-card/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" :
                        isSilver ? "h-24 bg-surface-card/30" : "h-20 bg-surface-card/20"
                      }`}>
                        <p className="text-xs font-bold text-mute uppercase tracking-wider">{entry.ride_count} rides</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Lower list rankings (ranks 4+) */}
              {otherDests.length > 0 && (
                <div className="max-w-2xl mx-auto card-bordered p-4 bg-surface-card/25 backdrop-blur-md rounded-2xl border border-hairline-strong shadow-lg">
                  <ol className="divide-y divide-hairline">
                    {otherDests.map((entry) => (
                      <li key={entry.destination_id} className="py-2.5 first:pt-0 last:pb-0">
                        <Link
                          href={`/destinations/${entry.destination_id}`}
                          className="flex items-center gap-3 rounded-xl px-4 py-2 hover:bg-surface-elevated/40 transition-colors"
                        >
                          <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                            #{entry.rank}
                          </span>
                          <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                            {entry.destination_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-ink text-sm font-semibold truncate">{entry.destination_name}</p>
                          </div>
                          <span className="mono text-xs font-bold text-stone uppercase shrink-0">
                            {entry.ride_count} rides
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Weekly League */}
        <div className={`space-y-6 ${tab === "league" ? "" : "hidden"}`}>
          <div className="text-center sm:text-left">
            <h2 className="heading-md text-ink uppercase tracking-wider font-display">Weekly League</h2>
            <p className="caption tracking-wide mt-1">
              Gold / Silver / Bronze by distance ridden this week{weekStart ? ` (since ${weekStart})` : ""}
            </p>
          </div>

          {!leagueTiers || leagueTiers.length === 0 ? (
            <p className="caption">No one&apos;s logged a distance-tracked ride this week yet.</p>
          ) : (
            <div className="max-w-2xl mx-auto space-y-3">
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
                              href={`/users/${entry.user.id}`}
                              className={`flex items-center gap-3 rounded-xl px-3 py-1.5 hover:bg-surface-elevated/40 transition-colors ${
                                isMe ? "bg-surface-elevated/60 border border-hairline-strong" : ""
                              }`}
                            >
                              <span className="font-display font-semibold text-xs text-mute w-8 text-center shrink-0">
                                #{entry.rank}
                              </span>
                              <div className="w-8 h-8 rounded-full bg-surface-deep border border-hairline-strong flex items-center justify-center text-xs font-bold shrink-0 uppercase text-ink">
                                {entry.user.name.charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-ink text-sm font-semibold truncate">
                                  {entry.user.name}
                                  {isMe && <span className="text-accent-gold text-xs font-semibold tracking-wide uppercase ml-1.5">(YOU)</span>}
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
          )}
        </div>
      </div>
    </div>
  );
}
