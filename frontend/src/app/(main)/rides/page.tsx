"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import RideCard from "@/components/rides/RideCard";
import type {
  MineRideOut,
  RidePlanSummary,
} from "@/lib/api.types";


type MainTab = "feed" | "mine";
type MyRideFilter = "all" | "planned" | "in_progress" | "completed" | "cancelled";


export default function RidesPage() {
  const { user } = useAuth();

  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const [myFilter, setMyFilter] = useState<MyRideFilter>("all");
  const [followingOnly, setFollowingOnly] = useState(false);

  const [feedRides, setFeedRides] = useState<RidePlanSummary[]>([]);
  const [myRides, setMyRides] = useState<MineRideOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (mainTab === "feed") {
        const res = await api.getRideFeed({
          following_only: followingOnly,
          limit: 50,
        });
        setFeedRides(res.rides);
      } else {
        const res = await api.getMyRides({
          status: myFilter === "all" ? undefined : myFilter,
          limit: 50,
        });
        setMyRides(res.rides);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rides");
    } finally {
      setLoading(false);
    }
  }, [mainTab, myFilter, followingOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const rides: RidePlanSummary[] =
    mainTab === "feed" ? feedRides : myRides;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-surface-card rounded-lg p-1">
          <button
            onClick={() => setMainTab("feed")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mainTab === "feed" ? "bg-ink text-canvas" : "text-mute hover:text-ink"
            }`}
          >
            Feed
          </button>
          <button
            onClick={() => setMainTab("mine")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mainTab === "mine" ? "bg-ink text-canvas" : "text-mute hover:text-ink"
            }`}
          >
            My Rides
          </button>
        </div>

        <Link
          href="/rides/create"
          className="bg-ink text-canvas hover:bg-surface-light px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Plan a ride
        </Link>
      </div>

      {/* Filters */}
      {mainTab === "feed" && user && (
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={followingOnly}
            onChange={(e) => setFollowingOnly(e.target.checked)}
            className="rounded border-hairline-strong text-accent-blue focus:ring-ink/30"
          />
          Only show rides from people I follow
        </label>
      )}

      {mainTab === "mine" && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["all", "planned", "in_progress", "completed", "cancelled"] as MyRideFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setMyFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                myFilter === f
                  ? "bg-ink text-canvas"
                  : "bg-surface-card text-mute hover:text-ink"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : rides.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-mute">
            {mainTab === "feed" && followingOnly
              ? "No rides from people you follow yet."
              : mainTab === "feed"
              ? "No rides planned right now."
              : "You don't have any rides yet."}
          </p>
          <Link href="/rides/create" className="text-accent-blue hover:text-accent-blue text-sm mt-2 inline-block">
            Plan one
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rides.map((ride) => (
            <div key={ride.id} className="relative">
              <RideCard ride={ride} />
              {mainTab === "mine" && "role" in ride && (
                <span className="absolute top-3 left-3 bg-canvas/80 text-ink text-xs px-2 py-1 rounded-full font-medium capitalize">
                  {(ride as MineRideOut).role}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
