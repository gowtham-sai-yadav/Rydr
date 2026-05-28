"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  CostEstimate,
  DestinationOut,
  RatingOut,
} from "@/lib/api.types";


export default function DestinationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { user } = useAuth();

  const [destination, setDestination] = useState<DestinationOut | null>(null);
  const [ratings, setRatings] = useState<RatingOut[]>([]);
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [destRes, ratingsRes] = await Promise.all([
          api.getDestination(id),
          api.listRatings(id, 1, 10),
        ]);
        if (cancelled) return;
        setDestination(destRes);
        setRatings(ratingsRes.ratings);

        // Cost estimate — only if the user is logged in with a home location.
        if (user?.home_latitude && user?.home_longitude) {
          try {
            const c = await api.getCostEstimate(id);
            if (!cancelled) setCost(c);
          } catch {
            // Endpoint 400s if origin can't be resolved — silently skip.
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load destination");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, user?.home_latitude, user?.home_longitude]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (error || !destination) {
    return (
      <div className="text-center py-12 text-mute">
        {error || "Destination not found"}
      </div>
    );
  }

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${destination.latitude},${destination.longitude}`;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 glow-blue">
      {/* Hero */}
      <div className="relative rounded-xl overflow-hidden h-72 bg-surface-card">
        {destination.hero_media_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={destination.hero_media_url}
            alt={destination.name}
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-3xl font-bold text-ink">{destination.name}</h1>
          {destination.region && (
            <p className="text-body">{destination.region}, {destination.country}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm">
            <span className="text-accent-yellow">★ {destination.avg_rating.toFixed(1)}</span>
            <span className="text-body">({destination.rating_count} ratings)</span>
            <span className="text-body capitalize">· {destination.terrain_difficulty}</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      {destination.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {destination.tags.map((t) => (
            <span
              key={t.id}
              className="bg-surface-card text-body text-xs px-3 py-1 rounded-full font-medium"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {destination.description && (
        <div className="bg-surface-card rounded-xl p-6">
          <p className="text-body whitespace-pre-wrap">{destination.description}</p>
        </div>
      )}

      {/* Practical info */}
      <div className="bg-surface-card rounded-xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-mute uppercase">Best season</p>
          <p className="text-ink font-medium">{destination.best_season || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-mute uppercase">Best time</p>
          <p className="text-ink font-medium">{destination.best_time_of_day || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-mute uppercase">Food cost</p>
          <p className="text-ink font-medium">
            {destination.estimated_food_cost != null
              ? `${destination.currency} ${destination.estimated_food_cost}`
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-mute uppercase">Entry</p>
          <p className="text-ink font-medium">
            {destination.estimated_entry_cost != null
              ? `${destination.currency} ${destination.estimated_entry_cost}`
              : "—"}
          </p>
        </div>
      </div>

      {/* Cost estimate */}
      {cost && (
        <div className="bg-surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-2">Cost estimate (from your home)</h2>
          <p className="text-xs text-mute mb-3">
            Round-trip ~{cost.distance_km} km · ±20% buffer
          </p>
          {cost.fuel_included ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-mute">Fuel</p>
                <p className="text-ink font-medium">{cost.currency} {cost.fuel}</p>
              </div>
              <div>
                <p className="text-xs text-mute">Food</p>
                <p className="text-ink font-medium">{cost.currency} {cost.food}</p>
              </div>
              <div>
                <p className="text-xs text-mute">Entry</p>
                <p className="text-ink font-medium">{cost.currency} {cost.entry}</p>
              </div>
              <div>
                <p className="text-xs text-mute">Total</p>
                <p className="text-accent-blue font-semibold">
                  {cost.currency} {cost.total_low}–{cost.total_high}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 px-4 py-3 rounded-lg text-sm">
              Add your bike&apos;s mileage on your{" "}
              <Link href="/profile" className="underline">profile</Link>{" "}
              to see a fuel estimate.
            </div>
          )}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-wrap gap-3">
        <Link
          href={`/rides/create?destination=${destination.id}`}
          className="flex-1 bg-ink text-canvas hover:bg-surface-light text-center py-3 rounded-lg font-medium"
        >
          Plan a ride here
        </Link>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-surface-elevated hover:bg-surface-elevated text-ink px-6 py-3 rounded-lg font-medium"
        >
          Open in Google Maps
        </a>
      </div>

      {/* Recent riders */}
      {destination.recent_rider_count > 0 && (
        <div className="bg-surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-3">
            {destination.recent_rider_count} riders went recently
          </h2>
          <div className="flex flex-wrap gap-3">
            {destination.recent_riders.map((r) => (
              <Link
                key={r.id}
                href={`/users/${r.id}`}
                className="flex items-center gap-2 bg-surface-elevated/50 hover:bg-surface-elevated rounded-full pr-3 pl-1 py-1"
              >
                <div className="w-7 h-7 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold">
                  {r.name.charAt(0)}
                </div>
                <span className="text-ink text-sm">{r.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Media gallery */}
      {destination.media.length > 0 && (
        <div className="bg-surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-3">Photos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {destination.media.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={m.url}
                alt={m.caption || destination.name}
                className="w-full aspect-square object-cover rounded-lg"
              />
            ))}
          </div>
        </div>
      )}

      {/* Ratings */}
      <div className="bg-surface-card rounded-xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-3">Reviews</h2>
        {ratings.length === 0 ? (
          <p className="text-mute text-sm">No reviews yet.</p>
        ) : (
          <div className="space-y-4">
            {ratings.map((r) => (
              <div key={r.id} className="border-b border-hairline-strong last:border-0 pb-3 last:pb-0">
                <div className="flex items-center gap-3 mb-1">
                  {r.user && (
                    <Link
                      href={`/users/${r.user.id}`}
                      className="flex items-center gap-2 hover:opacity-80"
                    >
                      <div className="w-7 h-7 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold">
                        {r.user.name.charAt(0)}
                      </div>
                      <span className="text-ink text-sm font-medium">{r.user.name}</span>
                    </Link>
                  )}
                  <span className="text-accent-yellow text-sm">{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span>
                </div>
                {r.review && <p className="text-body text-sm">{r.review}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
