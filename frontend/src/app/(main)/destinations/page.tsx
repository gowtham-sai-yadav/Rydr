"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import MapPanel from "@/components/map/MapPanel";
import type {
  DestinationSummary,
  TagListResponse,
} from "@/lib/api.types";
import { routes } from "@/lib/routes";


type SortMode = "rating" | "distance" | "popularity";

// The filter rail applies to the list. The map is viewport-driven and
// deliberately unfiltered: a pin missing because of a tag filter looks
// identical to a place that does not exist, which is worse than showing
// everything nearby. Documented here because it is a choice, not an
// oversight.
type ViewMode = "list" | "map";


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
  const [view, setView] = useState<ViewMode>("list");
  const router = useRouter();

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
      {/* flex-wrap, and the toggle before the CTA in source order, so a
          narrow phone wraps rather than pushing the button off-screen —
          which is what a nowrap CTA in a nowrap row did at 412px. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">Destinations</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* List / map toggle. role=tablist so the pair reads as one control
              to a screen reader rather than two unrelated buttons. */}
          <div
            role="tablist"
            aria-label="View destinations as"
            className="flex rounded-lg bg-surface-card border border-hairline p-0.5"
          >
            {(["list", "map"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                role="tab"
                aria-selected={view === mode}
                onClick={() => setView(mode)}
                className={`px-3 py-1.5 rounded-md text-[13px] font-medium capitalize transition-colors ${
                  view === mode
                    ? "bg-surface-elevated text-ink"
                    : "text-charcoal hover:text-ink"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {user && (
            <Link
              href="/destinations/new"
              className="bg-ink text-canvas hover:bg-surface-light text-sm font-medium px-4 py-2 rounded-lg whitespace-nowrap"
            >
              {/* Shorter label on phones; the full one from sm up. */}
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add destination</span>
            </Link>
          )}
        </div>
      </div>

      {view === "map" && (
        <MapPanel
          origin={
            user?.home_latitude != null && user?.home_longitude != null
              ? [user.home_latitude, user.home_longitude]
              : null
          }
          onSelect={(pin) => router.push(routes.destination(pin.id))}
        />
      )}

      {view === "list" && (
      <>
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
                    ? "bg-ink text-canvas"
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
                    ? "bg-ink text-canvas"
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
                className="rounded border-hairline-strong text-accent-blue focus:ring-ink/30"
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
              className="text-sm text-accent-blue hover:text-accent-blue ml-auto"
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
          <Link href="/destinations/new" className="text-accent-blue hover:text-accent-blue">
            adding a new one
          </Link>
          .
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={routes.destination(d.id)}
              className="bg-surface-card rounded-xl overflow-hidden hover:ring-1 hover:ring-hairline-strong transition-all"
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
                  <span className="text-accent-yellow">
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
      </>
      )}
    </div>
  );
}
