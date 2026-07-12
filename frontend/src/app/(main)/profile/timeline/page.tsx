"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { TimelineEntryOut } from "@/lib/api.types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TimelinePage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimelineEntryOut[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .getTimeline(user.id, 150)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load timeline"));
  }, [user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">
        Photo Timeline
      </h1>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {entries === null ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-mute text-sm text-center py-12">No photos attached to your rides yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {entries.map((e) => (
            <Link
              key={e.media_id}
              href={`/rides/${e.ride_plan_id}/log`}
              className="group relative rounded-lg overflow-hidden bg-surface-card aspect-square"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.url}
                alt={e.caption || e.destination_name || "ride photo"}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/90 to-transparent p-2">
                <p className="text-ink text-[11px] font-semibold truncate">{e.destination_name || "Ride"}</p>
                <p className="text-mute text-[10px]">{formatDate(e.taken_at)}</p>
              </div>
              {e.latitude != null && (
                <span className="absolute top-2 right-2 text-[10px]" title="Geo-tagged">📍</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
