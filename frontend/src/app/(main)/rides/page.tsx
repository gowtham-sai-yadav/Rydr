"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Ride } from "@/lib/types";
import RideCard from "@/components/rides/RideCard";

type MainTab = "feed" | "mine";
type MyRideFilter = "all" | "open" | "completed" | "cancelled";

export default function RidesPage() {
  const [mainTab, setMainTab] = useState<MainTab>("feed");
  const [myFilter, setMyFilter] = useState<MyRideFilter>("all");
  const [feedRides, setFeedRides] = useState<Ride[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (mainTab === "feed") {
      setLoading(true);
      api.getRideFeed().then((res) => {
        const data = res as { rides: Ride[] };
        setFeedRides(data.rides);
      }).finally(() => setLoading(false));
    } else {
      setLoading(true);
      const status = myFilter === "all" ? undefined : myFilter;
      api.getMyRides(status).then((res) => {
        const data = res as { rides: Ride[] };
        setMyRides(data.rides);
      }).finally(() => setLoading(false));
    }
  }, [mainTab, myFilter]);

  const rides = mainTab === "feed" ? feedRides : myRides;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setMainTab("feed")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mainTab === "feed" ? "bg-orange-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            Feed
          </button>
          <button
            onClick={() => setMainTab("mine")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              mainTab === "mine" ? "bg-orange-600 text-white" : "text-gray-400 hover:text-white"
            }`}
          >
            My Rides
          </button>
        </div>

        <Link
          href="/rides/create"
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Ride
        </Link>
      </div>

      {mainTab === "mine" && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(["all", "open", "completed", "cancelled"] as MyRideFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setMyFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap transition-colors ${
                myFilter === f
                  ? "bg-orange-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
        </div>
      ) : rides.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No rides found</p>
          {mainTab === "feed" && (
            <Link href="/rides/create" className="text-orange-500 hover:text-orange-400 text-sm mt-2 inline-block">
              Create the first ride
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} />
          ))}
        </div>
      )}
    </div>
  );
}
