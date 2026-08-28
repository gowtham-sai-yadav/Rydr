"use client";
import Link from "next/link";
import type { RidePlanSummary } from "@/lib/api.types";
import { routes } from "@/lib/routes";


const difficultyDotColor: Record<string, string> = {
  easy: "bg-accent-green",
  moderate: "bg-accent-yellow",
  hard: "bg-accent-orange",
  expert: "bg-accent-red",
};


export default function RideCard({ ride }: { ride: RidePlanSummary }) {
  const dateLabel = new Date(ride.planned_date + "T00:00:00").toLocaleDateString(
    undefined,
    { day: "numeric", month: "short" },
  );

  return (
    <Link href={routes.ride(ride.id)} className="block group">
      <div className="card-bordered overflow-hidden p-0 transition-colors hover:border-hairline-strong group-hover:bg-surface-elevated">
        <div className="relative aspect-[16/10] bg-surface-deep">
          {ride.thumbnail_url || ride.destination?.hero_media_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ride.thumbnail_url || ride.destination?.hero_media_url || ""}
              alt={ride.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
          )}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
            <span className="pill">
              <span className={`status-dot ${difficultyDotColor[ride.difficulty_level] || "bg-mute"}`} />
              {ride.difficulty_level}
            </span>
            <span className="pill capitalize">{ride.status.replace("_", " ")}</span>
          </div>
        </div>
        <div className="p-6 space-y-3">
          {ride.destination && (
            <p className="label-eyebrow">→ {ride.destination.name}</p>
          )}
          <h3 className="heading-sm text-ink line-clamp-1">{ride.title}</h3>
          <div className="flex items-center justify-between text-[13px] text-charcoal">
            <div className="flex items-center gap-2 mono">
              <span>{dateLabel}</span>
              <span className="text-stone">·</span>
              <span>{ride.planned_start_time.slice(0, 5)}</span>
            </div>
            <span className="text-charcoal">
              {ride.participant_count}/{ride.max_riders} riders
            </span>
          </div>
          {ride.captain && (
            <p className="caption">by {ride.captain.name}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
