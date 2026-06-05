"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import DestinationMap from "@/components/destinations/DestinationMap";
import type {
  DestinationSummary,
  TagListResponse,
} from "@/lib/api.types";

type SortMode = "rating" | "distance" | "popularity";
type ViewMode = "grid" | "map";


export default function DestinationsPage() {
  const { user } = useAuth();

  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");
  const [error, setError] = useState("");

  // Filter state
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedVehicleFit, setSelectedVehicleFit] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("rating");
  const [useHomeOrigin, setUseHomeOrigin] = useState(false);

  const canUseDistance = !!user?.home_latitude && !!user?.home_longitude;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tagsRes, destsRes] = await Promise.all([
        tags.vibe.length > 0
          ? Promise.resolve(tags)
          : api.listTags(),
        api.listDestinations({
          tags: Array.from(selectedTags),
          vehicle_fit: Array.from(selectedVehicleFit),
          q: query || undefined,
          sort,
          from_lat: useHomeOrigin && user?.home_latitude ? user.home_latitude : undefined,
          from_lng: useHomeOrigin && user?.home_longitude ? user.home_longitude : undefined,
          limit: 50,
        }),
      ]);
      if (tags.vibe.length === 0) setTags(tagsRes);
      setDestinations(destsRes.destinations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load destinations");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTags, selectedVehicleFit, query, sort, useHomeOrigin, user?.home_latitude, user?.home_longitude]);

  useEffect(() => {
    // Debounce on q; immediate on filter changes.
    const handle = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  const toggleTag = (slug: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const toggleVehicleFit = (slug: string) => {
    setSelectedVehicleFit((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12 glow-orange">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Destinations</h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 bg-surface-card rounded-lg p-1">
            <button
              onClick={() => setView("grid")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "grid" ? "bg-accent-gold text-canvas" : "text-mute hover:text-ink"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setView("map")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === "map" ? "bg-accent-gold text-canvas" : "text-mute hover:text-ink"
              }`}
            >
              Map
            </button>
          </div>
          {user && (
            <Link
              href="/destinations/new"
              className="bg-accent-gold text-canvas hover:bg-accent-gold/90 text-sm font-medium px-4 py-2 rounded-lg"
            >
              Add destination
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-card rounded-xl p-4 space-y-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or region…"
          className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-ink/30"
        />

        <div>
          <p className="text-xs text-mute uppercase mb-2">Vibe</p>
          <div className="flex flex-wrap gap-2">
            {tags.vibe.map((t) => (
              <button
                key={t.slug}
                onClick={() => toggleTag(t.slug)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedTags.has(t.slug)
                    ? "bg-accent-gold text-canvas"
                    : "bg-surface-elevated text-body hover:bg-surface-elevated"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-mute uppercase mb-2">Vehicle fit</p>
          <div className="flex flex-wrap gap-2">
            {tags.vehicle_fit.map((t) => (
              <button
                key={t.slug}
                onClick={() => toggleVehicleFit(t.slug)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedVehicleFit.has(t.slug)
                    ? "bg-accent-gold text-canvas"
                    : "bg-surface-elevated text-body hover:bg-surface-elevated"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-body">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-1 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
            >
              <option value="rating">Top rated</option>
              <option value="popularity">Most rated</option>
              <option value="distance" disabled={!canUseDistance}>
                Distance{canUseDistance ? "" : " (set home in profile)"}
              </option>
            </select>
          </label>
          {canUseDistance && sort !== "distance" && (
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                checked={useHomeOrigin}
                onChange={(e) => setUseHomeOrigin(e.target.checked)}
                className="rounded border-hairline-strong text-accent-gold focus:ring-ink/30"
              />
              Show distance from home
            </label>
          )}
          {(selectedTags.size > 0 || selectedVehicleFit.size > 0 || query) && (
            <button
              onClick={() => {
                setSelectedTags(new Set());
                setSelectedVehicleFit(new Set());
                setQuery("");
              }}
              className="text-sm text-accent-gold hover:text-accent-gold ml-auto"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

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
      ) : destinations.length === 0 ? (
        <div className="text-center py-12 text-mute">
          No destinations match. Try clearing filters or{" "}
          <Link href="/destinations/new" className="text-accent-gold hover:text-accent-gold">
            adding a new one
          </Link>
          .
        </div>
      ) : view === "map" ? (
        <DestinationMap
          destinations={destinations.map((d) => ({
            id: d.id,
            name: d.name,
            latitude: d.latitude,
            longitude: d.longitude,
            region: d.region,
          }))}
          height={480}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/destinations/${d.id}`}
              className="bg-surface-card rounded-xl overflow-hidden hover:ring-1 hover:ring-accent-gold/40 transition-all"
            >
              <div className="aspect-video bg-surface-elevated relative">
                {d.hero_media_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.hero_media_url}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                )}
                {d.distance_km != null && (
                  <span className="absolute top-2 right-2 bg-canvas/80 text-ink text-xs px-2 py-1 rounded-full font-medium">
                    {d.distance_km} km
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-ink font-semibold">{d.name}</h3>
                {d.region && <p className="text-mute text-sm">{d.region}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-accent-gold">
                    ★ {d.avg_rating.toFixed(1)}
                  </span>
                  <span className="text-stone">({d.rating_count})</span>
                  <span className="text-stone capitalize ml-auto">
                    {d.terrain_difficulty}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
