"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import MapPanel from "@/components/map/MapPanel";
import { PlaceAutocomplete } from "@/components/destinations/PlaceAutocomplete";
import type {
  DestinationSummary,
  RegionSummary,
  TagListResponse,
} from "@/lib/api.types";
import { routes } from "@/lib/routes";

type SortMode = "rating" | "distance" | "popularity";

// The filter rail applies to the grid. The map is viewport-driven and
// deliberately unfiltered: a pin missing because of a tag filter looks
// identical to a place that does not exist, which is worse than showing
// everything nearby. Documented here because it is a choice, not an
// oversight.
type ViewMode = "grid" | "map";

export default function DestinationsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [surpriseOpen, setSurpriseOpen] = useState(false);
  const [surpriseHours, setSurpriseHours] = useState("3");
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseError, setSurpriseError] = useState("");

  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");
  const [error, setError] = useState("");

  // Filter state
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedVehicleFit, setSelectedVehicleFit] = useState<Set<string>>(new Set());
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("rating");
  const [useHomeOrigin, setUseHomeOrigin] = useState(false);
  const [allNames, setAllNames] = useState<string[]>([]);

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
          region: selectedRegion || undefined,
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
  }, [selectedTags, selectedVehicleFit, selectedRegion, query, sort, useHomeOrigin, user?.home_latitude, user?.home_longitude]);

  useEffect(() => {
    api.listRegions().then((res) => setRegions(res.regions)).catch(() => {});
  }, []);

  useEffect(() => {
    // Debounce on q; immediate on filter changes.
    const handle = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  // Full unfiltered name list, fetched once - used only to tell the India
  // place-search dropdown which suggestions Rydr already has a destination
  // for, independent of whatever the current search/filter has narrowed
  // the grid down to.
  useEffect(() => {
    api
      .listDestinations({ limit: 50 }) // backend caps limit at 50 - matches current catalog size
      .then((res) => setAllNames(res.destinations.map((d) => d.name)))
      .catch(() => {
        // Non-blocking - autocomplete just won't distinguish known places.
      });
  }, []);

  const handleSurpriseMe = async () => {
    setSurpriseError("");
    const hours = parseFloat(surpriseHours);
    if (Number.isNaN(hours) || hours <= 0) {
      setSurpriseError("Enter a valid number of hours");
      return;
    }
    if (!canUseDistance) {
      setSurpriseError("Need a home location set on your profile first");
      return;
    }
    setSurpriseLoading(true);
    try {
      const dest = await api.surpriseMe({
        time_budget_hours: hours,
        from_lat: user!.home_latitude!,
        from_lng: user!.home_longitude!,
      });
      router.push(routes.destination(dest.id));
    } catch (err) {
      setSurpriseError(err instanceof Error ? err.message : "Couldn't find a match — try a bigger time budget");
    } finally {
      setSurpriseLoading(false);
    }
  };

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
    <div className="max-w-5xl mx-auto space-y-8 pb-16 relative">

      {/* 1. Winding Road Hero Banner */}
      <div className="h-44 sm:h-56 rounded-2xl overflow-hidden relative border border-hairline-strong shadow-lg select-none">
        <div
          className="absolute inset-0 bg-cover bg-center brightness-[0.55] filter saturate-[0.85]"
          style={{ backgroundImage: "url('/images/winding_road.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 z-10">
          <div className="text-center sm:text-left space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Scout Horizons</h1>
            <p className="text-xs text-mute font-semibold tracking-wider uppercase mt-1">Discover winding trails and rider hangouts</p>
          </div>
          {/* flex-wrap so a narrow phone wraps the controls onto their own
              row instead of pushing the CTA off-screen. */}
          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
            {/* Grid / map toggle. role=tablist so the pair reads as one
                control to a screen reader rather than two unrelated buttons. */}
            <div
              role="tablist"
              aria-label="View destinations as"
              className="flex gap-1 bg-surface-deep/80 border border-hairline-strong rounded-xl p-1 backdrop-blur-md"
            >
              {(["grid", "map"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  role="tab"
                  aria-selected={view === mode}
                  onClick={() => setView(mode)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider capitalize transition-all duration-200 ${
                    view === mode ? "bg-accent-gold text-canvas shadow-[0_0_12px_var(--color-accent-gold-glow)]" : "text-mute hover:text-ink"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSurpriseOpen((v) => !v)}
              className="btn h-10 px-5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 bg-accent-orange/20 text-accent-orange border border-accent-orange/30 hover:bg-accent-orange/30"
            >
              🎲 Surprise Me
            </button>
            {user && (
              <Link
                href={routes.newDestination}
                className="btn btn-primary h-10 px-5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200"
              >
                {/* Shorter label on phones; the full one from sm up. */}
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add destination</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {regions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedRegion(null)}
            className={`shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full border ${
              selectedRegion === null ? "bg-accent-gold text-canvas border-accent-gold" : "bg-surface-card text-mute border-hairline-strong"
            }`}
          >
            All regions
          </button>
          {regions.map((r) => (
            <button
              key={r.region}
              onClick={() => setSelectedRegion(r.region === selectedRegion ? null : r.region)}
              className={`shrink-0 text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full border whitespace-nowrap ${
                selectedRegion === r.region ? "bg-accent-gold text-canvas border-accent-gold" : "bg-surface-card text-mute border-hairline-strong"
              }`}
            >
              {r.region} <span className="opacity-60">({r.destination_count})</span>
            </button>
          ))}
        </div>
      )}

      {surpriseOpen && (
        <div className="card-bordered bg-surface-card/35 backdrop-blur-xl border border-accent-orange/30 p-6 rounded-2xl space-y-3">
          <p className="text-sm text-ink font-semibold">How much time do you have?</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={0.5}
              max={24}
              step={0.5}
              value={surpriseHours}
              onChange={(e) => setSurpriseHours(e.target.value)}
              className="w-24 bg-surface-deep/80 border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm"
            />
            <span className="text-mute text-sm">hours, round trip</span>
            <button
              onClick={handleSurpriseMe}
              disabled={surpriseLoading}
              className="bg-accent-orange text-canvas disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-semibold"
            >
              {surpriseLoading ? "Picking…" : "Surprise me"}
            </button>
          </div>
          {surpriseError && <p className="text-accent-red text-xs">{surpriseError}</p>}
          {!canUseDistance && (
            <p className="text-mute text-xs">
              Set your home location on your{" "}
              <Link href={routes.profile} className="underline">profile</Link> so we know where to start from.
            </p>
          )}
        </div>
      )}

      {view === "map" && (
        <div className="rounded-2xl overflow-hidden border border-hairline-strong shadow-2xl">
          <MapPanel
            origin={
              user?.home_latitude != null && user?.home_longitude != null
                ? [user.home_latitude, user.home_longitude]
                : null
            }
            onSelect={(pin) => router.push(routes.destination(pin.id))}
          />
        </div>
      )}

      {view === "grid" && (
      <>
      {/* 2. Enhanced Filters Dashboard */}
      <div className="card-bordered bg-surface-card/35 backdrop-blur-xl border border-hairline-strong p-6 rounded-2xl space-y-6 relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />

        {/* Search bar with magnifying glass icon */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone">
            <svg className="h-4.5 w-4.5 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, region, or twisty road..."
            className="w-full bg-surface-deep/60 border border-hairline-strong focus:border-accent-gold rounded-xl pl-10 pr-4 py-3 text-ink placeholder:text-stone focus:outline-none transition-all duration-200 text-sm shadow-inner"
          />
          <PlaceAutocomplete query={query} knownNames={allNames} />
        </div>

        {/* Vibe / Difficulty Tags */}
        <div className="space-y-3">
          <p className="text-[9px] font-bold text-accent-gold tracking-widest uppercase flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-gold" />
            Vibe / Difficulty
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.vibe.map((t) => {
              const active = selectedTags.has(t.slug);
              return (
                <button
                  key={t.slug}
                  onClick={() => toggleTag(t.slug)}
                  className={`text-[10px] px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider transition-all duration-200 border ${
                    active
                      ? "bg-gradient-to-r from-accent-gold/25 to-accent-orange/15 border-accent-gold/50 text-accent-gold shadow-[0_0_12px_rgba(212,175,55,0.25)] scale-[1.03]"
                      : "bg-surface-deep/60 border-hairline-strong text-mute hover:border-accent-gold/45 hover:text-ink hover:scale-[1.02]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Vehicle Fit Tags */}
        <div className="space-y-3">
          <p className="text-[9px] font-bold text-accent-blue tracking-widest uppercase flex items-center gap-1.5 select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
            Vehicle Fit
          </p>
          <div className="flex flex-wrap gap-2">
            {tags.vehicle_fit.map((t) => {
              const active = selectedVehicleFit.has(t.slug);
              return (
                <button
                  key={t.slug}
                  onClick={() => toggleVehicleFit(t.slug)}
                  className={`text-[10px] px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider transition-all duration-200 border ${
                    active
                      ? "bg-gradient-to-r from-accent-blue/25 to-accent-blue/10 border-accent-blue/50 text-accent-blue shadow-[0_0_12px_rgba(6,182,212,0.25)] scale-[1.03]"
                      : "bg-surface-deep/60 border-hairline-strong text-mute hover:border-accent-blue/45 hover:text-ink hover:scale-[1.02]"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Bottom Sorting segment */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-hairline border-dashed">
          <label className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-mute">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-3 py-1.5 text-ink text-xs focus:outline-none transition-all duration-200 font-sans"
            >
              <option value="rating" className="bg-canvas text-ink">Top Rated</option>
              <option value="popularity" className="bg-canvas text-ink">Most Popular</option>
              <option value="distance" disabled={!canUseDistance} className="bg-canvas text-ink">
                Nearby
              </option>
            </select>
          </label>

          {canUseDistance && sort !== "distance" && (
            <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-mute select-none cursor-pointer">
              <input
                type="checkbox"
                checked={useHomeOrigin}
                onChange={(e) => setUseHomeOrigin(e.target.checked)}
                className="rounded border-hairline-strong text-accent-gold focus:ring-accent-gold bg-surface-deep w-4 h-4 cursor-pointer"
              />
              Show distance from home
            </label>
          )}

          {(selectedTags.size > 0 || selectedVehicleFit.size > 0 || query || selectedRegion) && (
            <button
              onClick={() => {
                setSelectedTags(new Set());
                setSelectedVehicleFit(new Set());
                setSelectedRegion(null);
                setQuery("");
              }}
              className="text-[10px] font-bold uppercase tracking-widest text-accent-red hover:underline transition-all duration-200"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm shadow-lg">
          {error}
        </div>
      )}

      {/* Grid Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-gold/20 border-t-accent-gold" />
        </div>
      ) : destinations.length === 0 ? (
        <div className="text-center py-20 text-mute border border-dashed border-hairline-strong rounded-2xl bg-surface-card/10">
          <p className="font-semibold text-sm">No scouted routes match your filters.</p>
          <Link href={routes.newDestination} className="text-accent-gold hover:underline font-bold text-xs uppercase tracking-wider mt-3 inline-block">
            + Scout New Horizon
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {destinations.map((d) => (
            <Link
              key={d.id}
              href={routes.destination(d.id)}
              className="group bg-surface-card/30 backdrop-blur-md rounded-2xl overflow-hidden border border-hairline-strong hover:border-accent-gold/40 hover:-translate-y-1.5 transition-all duration-300 shadow-lg hover:shadow-2xl flex flex-col relative"
            >
              <div className="aspect-video bg-surface-deep relative overflow-hidden">
                {d.hero_media_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.hero_media_url}
                    alt={d.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-elevated to-surface-deep">
                    <svg className="w-8 h-8 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                  </div>
                )}
                {d.distance_km != null && (
                  <span className="absolute top-3 right-3 bg-canvas/80 backdrop-blur-md text-ink text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border border-hairline-strong">
                    {d.distance_km} km
                  </span>
                )}
                <div className="absolute bottom-3 left-3 bg-canvas/80 backdrop-blur-md text-accent-blue text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border border-hairline-strong capitalize">
                  {d.terrain_difficulty}
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-ink font-semibold text-sm tracking-tight group-hover:text-accent-gold transition-colors duration-200 line-clamp-1">{d.name}</h3>
                  {d.region && <p className="text-mute text-[10px] font-semibold tracking-wider uppercase mt-1">{d.region}</p>}
                </div>
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-hairline border-dashed">
                  <span className="text-accent-gold text-xs font-semibold tracking-wide flex items-center gap-1 select-none">
                    <svg className="w-3.5 h-3.5 fill-accent-gold text-accent-gold" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    {d.avg_rating.toFixed(1)}
                  </span>
                  <span className="text-[10px] font-medium text-stone uppercase">({d.rating_count} reviews)</span>
                  <div className="ml-auto w-7 h-7 rounded-full bg-surface-deep/80 border border-hairline-strong flex items-center justify-center group-hover:border-accent-gold/40 group-hover:bg-accent-gold/10 transition-all duration-300">
                    <svg className="w-3.5 h-3.5 text-accent-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
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
