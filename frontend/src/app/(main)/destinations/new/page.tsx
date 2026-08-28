"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { TagListResponse } from "@/lib/api.types";
import { routes } from "@/lib/routes";

function NewDestinationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });

  // Prefilled when arriving from the India-wide place search
  const [name, setName] = useState(searchParams.get("name") || "");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [latitude, setLatitude] = useState(searchParams.get("latitude") || "");
  const [longitude, setLongitude] = useState(searchParams.get("longitude") || "");
  const [terrain, setTerrain] = useState<"chill" | "moderate" | "rough">("moderate");
  const [foodCost, setFoodCost] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [bestSeason, setBestSeason] = useState("");
  const [bestTimeOfDay, setBestTimeOfDay] = useState("");
  const [heroMediaUrl, setHeroMediaUrl] = useState("");
  const [galleryRaw, setGalleryRaw] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Geocoding status
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");

  useEffect(() => {
    api.listTags().then(setTags).catch(() => {
      // Non-blocking — tags are optional on submission
    });
  }, []);

  const handleAutoGeocode = async () => {
    if (!name) return;
    setGeocoding(true);
    setGeocodeStatus("Searching coordinates...");
    try {
      const searchTerms = region ? `${name}, ${region}` : name;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerms)}&format=json&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "RydrApp-DeveloperAgent"
          }
        }
      );
      if (!res.ok) throw new Error("Network response error");
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        setLatitude(parseFloat(item.lat).toFixed(6));
        setLongitude(parseFloat(item.lon).toFixed(6));
        setGeocodeStatus("Coordinates successfully resolved!");
        if (!region && item.display_name) {
          const parts = item.display_name.split(", ");
          const statePart = parts[parts.length - 3] || parts[parts.length - 2];
          if (statePart) setRegion(statePart);
        }
      } else {
        if (region) {
          // Fallback without region
          const resFallback = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
            {
              headers: {
                "Accept-Language": "en",
                "User-Agent": "RydrApp-DeveloperAgent"
              }
            }
          );
          const dataFallback = await resFallback.json();
          if (dataFallback && dataFallback.length > 0) {
            const item = dataFallback[0];
            setLatitude(parseFloat(item.lat).toFixed(6));
            setLongitude(parseFloat(item.lon).toFixed(6));
            setGeocodeStatus("Coordinates resolved (region fallback)!");
            return;
          }
        }
        setGeocodeStatus("Location not found. Please enter coordinates manually.");
      }
    } catch {
      setGeocodeStatus("Failed to query coordinate server.");
    } finally {
      setGeocoding(false);
    }
  };

  const toggle = (slug: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Latitude and longitude are required (use coordinates auto-detector or paste manually).");
      return;
    }

    setLoading(true);
    try {
      const galleryUrls = galleryRaw
        .split(/\s*[\n,]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      const dest = await api.submitDestination({
        name,
        description: description || null,
        region: region || null,
        latitude: lat,
        longitude: lng,
        terrain_difficulty: terrain,
        estimated_food_cost: foodCost ? parseInt(foodCost) : null,
        estimated_entry_cost: entryCost ? parseInt(entryCost) : null,
        best_season: bestSeason || null,
        best_time_of_day: bestTimeOfDay || null,
        hero_media_url: heroMediaUrl || null,
        tag_slugs: Array.from(selectedTags),
        gallery_urls: galleryUrls,
      });
      router.push(routes.destination(dest.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit destination");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-8 relative">
      <div className="text-center sm:text-left">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Add a destination</h1>
        <p className="text-xs text-mute font-semibold tracking-wider uppercase mt-1 select-none">Share a new riding spot with the community</p>
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Basics */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Basics</h2>
          
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name && !latitude && !longitude) {
                  handleAutoGeocode();
                }
              }}
              required
              maxLength={200}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="e.g. Nandi Hills"
            />
            {name && (
              <button
                type="button"
                onClick={handleAutoGeocode}
                disabled={geocoding}
                className="mt-2 text-[10px] font-bold text-accent-gold uppercase tracking-widest hover:underline transition-all duration-200"
              >
                {geocoding ? "Detecting coordinates..." : "Auto-detect lat/lng from name →"}
              </button>
            )}
            {geocodeStatus && (
              <p className="text-[10px] font-semibold uppercase tracking-wider text-stone mt-1">{geocodeStatus}</p>
            )}
          </div>

          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              maxLength={100}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="e.g. Karnataka"
            />
          </div>

          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="What makes it special?"
            />
          </div>
        </div>

        {/* Location Coordinates */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Location</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Latitude *</label>
              <input
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                placeholder="13.3702"
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Longitude *</label>
              <input
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                placeholder="77.6835"
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              />
            </div>
          </div>
          <p className="text-[10px] text-stone font-semibold uppercase tracking-wider select-none">
            Tip: copy coordinates from Google Maps, or let our auto-detector handle it when you enter the name above.
          </p>
        </div>

        {/* Tags */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-green/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none font-display">Tags</h2>
          
          <div className="space-y-4">
            <div>
              <p className="text-[9px] font-bold text-accent-gold tracking-widest uppercase mb-2">Vibe</p>
              <div className="flex flex-wrap gap-2">
                {tags.vibe.map((t) => {
                  const active = selectedTags.has(t.slug);
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => toggle(t.slug)}
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
            
            <div>
              <p className="text-[9px] font-bold text-accent-blue tracking-widest uppercase mb-2">Vehicle fit</p>
              <div className="flex flex-wrap gap-2">
                {tags.vehicle_fit.map((t) => {
                  const active = selectedTags.has(t.slug);
                  return (
                    <button
                      key={t.slug}
                      type="button"
                      onClick={() => toggle(t.slug)}
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
          </div>
        </div>

        {/* Practical info */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-orange/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Practical info</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Terrain</label>
              <select
                value={terrain}
                onChange={(e) => setTerrain(e.target.value as typeof terrain)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              >
                <option value="chill" className="bg-canvas text-ink">Chill</option>
                <option value="moderate" className="bg-canvas text-ink">Moderate</option>
                <option value="rough" className="bg-canvas text-ink">Rough</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Food cost (₹)</label>
              <input
                type="number"
                value={foodCost}
                onChange={(e) => setFoodCost(e.target.value)}
                min={0}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. 250"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Entry cost (₹)</label>
              <input
                type="number"
                value={entryCost}
                onChange={(e) => setEntryCost(e.target.value)}
                min={0}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. 50"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Best season</label>
              <input
                value={bestSeason}
                onChange={(e) => setBestSeason(e.target.value)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. Oct–Mar"
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Best time of day</label>
              <input
                value={bestTimeOfDay}
                onChange={(e) => setBestTimeOfDay(e.target.value)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. Pre-dawn for sunrise"
              />
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none font-display">Photos</h2>
          
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Hero image URL</label>
            <input
              value={heroMediaUrl}
              onChange={(e) => setHeroMediaUrl(e.target.value)}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="https://..."
            />
          </div>
          
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Gallery URLs (one per line, max 20)</label>
            <textarea
              value={galleryRaw}
              onChange={(e) => setGalleryRaw(e.target.value)}
              rows={3}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="https://...&#10;https://..."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-bold py-3.5 rounded-xl uppercase text-xs tracking-wider transition-all duration-200 shadow-[0_4px_14px_rgba(212,175,55,0.15)]"
        >
          {loading ? "Submitting…" : "Add destination"}
        </button>
      </form>
    </div>
  );
}

export default function NewDestinationPage() {
  return (
    <Suspense fallback={<div className="text-mute text-center py-8">Loading…</div>}>
      <NewDestinationForm />
    </Suspense>
  );
}
