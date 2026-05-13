"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  DestinationSummary,
  TagListResponse,
} from "@/lib/api.types";


type SortMode = "rating" | "distance" | "popularity";


export default function DestinationsPage() {
  const { user } = useAuth();

  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });
  const [loading, setLoading] = useState(true);
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
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Destinations</h1>
        {user && (
          <Link
            href="/destinations/new"
            className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            Add destination
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or region…"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />

        <div>
          <p className="text-xs text-gray-400 uppercase mb-2">Vibe</p>
          <div className="flex flex-wrap gap-2">
            {tags.vibe.map((t) => (
              <button
                key={t.slug}
                onClick={() => toggleTag(t.slug)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedTags.has(t.slug)
                    ? "bg-orange-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase mb-2">Vehicle fit</p>
          <div className="flex flex-wrap gap-2">
            {tags.vehicle_fit.map((t) => (
              <button
                key={t.slug}
                onClick={() => toggleVehicleFit(t.slug)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  selectedVehicleFit.has(t.slug)
                    ? "bg-orange-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="rating">Top rated</option>
              <option value="popularity">Most rated</option>
              <option value="distance" disabled={!canUseDistance}>
                Distance{canUseDistance ? "" : " (set home in profile)"}
              </option>
            </select>
          </label>
          {canUseDistance && sort !== "distance" && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={useHomeOrigin}
                onChange={(e) => setUseHomeOrigin(e.target.checked)}
                className="rounded border-gray-600 text-orange-500 focus:ring-orange-500"
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
              className="text-sm text-orange-500 hover:text-orange-400 ml-auto"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
        </div>
      ) : destinations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No destinations match. Try clearing filters or{" "}
          <Link href="/destinations/new" className="text-orange-500 hover:text-orange-400">
            adding a new one
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={`/destinations/${d.id}`}
              className="bg-gray-800 rounded-xl overflow-hidden hover:ring-1 hover:ring-orange-500/30 transition-all"
            >
              <div className="aspect-video bg-gray-700 relative">
                {d.hero_media_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.hero_media_url}
                    alt={d.name}
                    className="w-full h-full object-cover"
                  />
                )}
                {d.distance_km != null && (
                  <span className="absolute top-2 right-2 bg-gray-900/80 text-white text-xs px-2 py-1 rounded-full font-medium">
                    {d.distance_km} km
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="text-white font-semibold">{d.name}</h3>
                {d.region && <p className="text-gray-400 text-sm">{d.region}</p>}
                <div className="flex items-center gap-3 mt-2 text-xs">
                  <span className="text-yellow-500">
                    ★ {d.avg_rating.toFixed(1)}
                  </span>
                  <span className="text-gray-500">({d.rating_count})</span>
                  <span className="text-gray-500 capitalize ml-auto">
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
