"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import RideCard from "@/components/rides/RideCard";
import type {
  MineRideOut,
  RidePlanSummary,
} from "@/lib/api.types";
import {
  Alert,
  Button,
  Spinner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui";
import { cn } from "@/lib/cn";


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
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)}>
          <TabsList>
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="mine">My rides</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button asChild size="default">
          <Link href="/rides/create">
            <Plus className="h-4 w-4" /> Plan a ride
          </Link>
        </Button>
      </div>

      {/* Filters */}
      {mainTab === "feed" && user && (
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            checked={followingOnly}
            onChange={(e) => setFollowingOnly(e.target.checked)}
            className="rounded border-hairline-strong text-accent-gold focus:ring-ink/30"
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
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
                myFilter === f
                  ? "bg-accent-gold text-canvas"
                  : "bg-surface-elevated text-mute hover:text-ink",
              )}
            >
              {f === "all"
                ? "All"
                : f === "in_progress"
                  ? "In progress"
                  : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      {/* Results */}
      {loading ? (
        <Spinner size="lg" block />
      ) : rides.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-mute">
            {mainTab === "feed" && followingOnly
              ? "No rides from people you follow yet."
              : mainTab === "feed"
              ? "No rides planned right now."
              : "You don't have any rides yet."}
          </p>
          <Link href="/rides/create" className="text-accent-gold hover:text-accent-gold text-sm mt-2 inline-block">
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
