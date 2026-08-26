"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import JourneyPlanner, { type Waypoint } from "@/components/journey/JourneyPlanner";
import type { DestinationOut } from "@/lib/api.types";

function JourneyPlanContent() {
  const searchParams = useSearchParams();
  const destinationId = searchParams.get("destination") || "";

  const [destination, setDestination] = useState<DestinationOut | null>(null);
  const [initialWaypoints, setInitialWaypoints] = useState<Waypoint[] | null>(null);

  useEffect(() => {
    if (!destinationId) {
      setInitialWaypoints([]);
      return;
    }
    api
      .getDestination(destinationId)
      .then((d) => {
        setDestination(d);
        setInitialWaypoints([
          { id: "wp-destination", lat: d.latitude, lng: d.longitude, label: d.name },
        ]);
      })
      .catch(() => setInitialWaypoints([]));
  }, [destinationId]);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-ink">Plan a journey</h1>
        <p className="text-mute text-sm mt-1">
          Drop waypoints for your route{destination ? ` to ${destination.name}` : ""} - start,
          stops, and the destination. Drag pins to fine-tune, add a note to any stop, and
          reorder as needed.
        </p>
      </div>

      <div className="bg-accent-gold/10 border border-accent-gold/20 text-accent-gold px-4 py-3 rounded-lg text-sm">
        Saving a route to the backend isn&apos;t wired up yet - the API only has a model for
        it, no endpoint. Your waypoints stay in this session; capture them manually (or via
        the ride description) for now.
      </div>

      {initialWaypoints !== null && (
        <JourneyPlanner
          initialWaypoints={initialWaypoints}
          center={destination ? [destination.latitude, destination.longitude] : undefined}
        />
      )}

      <div className="flex justify-end">
        <Link
          href={destinationId ? `/rides/create?destination=${destinationId}` : "/rides/create"}
          className="bg-accent-gold text-canvas hover:bg-accent-gold/90 px-6 py-3 rounded-lg font-medium"
        >
          Continue to ride details
        </Link>
      </div>
    </div>
  );
}

export default function JourneyPlanPage() {
  return (
    <Suspense fallback={<div className="text-mute text-center py-8">Loading…</div>}>
      <JourneyPlanContent />
    </Suspense>
  );
}
