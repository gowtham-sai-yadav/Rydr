"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { TagListResponse } from "@/lib/api.types";


export default function NewDestinationPage() {
  const router = useRouter();

  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
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

  useEffect(() => {
    api.listTags().then(setTags).catch(() => {
      // Non-blocking — tags are optional on submission
    });
  }, []);

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
      setError("Latitude and longitude are required (paste from Google Maps URL).");
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
      router.push(`/destinations/${dest.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit destination");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-12">
      <h1 className="text-2xl font-bold text-ink mb-2">Add a destination</h1>
      <p className="text-mute text-sm mb-6">
        Share a place you love. Right-click on Google Maps to copy lat/lng coordinates.
      </p>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basics */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Basics</h2>
          <div>
            <label className="block text-sm text-mute mb-1">Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Region</label>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              maxLength={100}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="e.g. Karnataka"
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="What makes it special?"
            />
          </div>
        </div>

        {/* Location */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Location</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-mute mb-1">Latitude *</label>
              <input
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                placeholder="13.3702"
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Longitude *</label>
              <input
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                placeholder="77.6835"
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
          </div>
          <p className="text-xs text-stone">
            Tip: in Google Maps, right-click the spot, then click on the coordinates that appear at the top to copy them.
          </p>
        </div>

        {/* Tags */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Tags</h2>
          <div>
            <p className="text-xs text-mute uppercase mb-2">Vibe</p>
            <div className="flex flex-wrap gap-2">
              {tags.vibe.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => toggle(t.slug)}
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
                  type="button"
                  onClick={() => toggle(t.slug)}
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
        </div>

        {/* Practical info */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Practical info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-mute mb-1">Terrain</label>
              <select
                value={terrain}
                onChange={(e) => setTerrain(e.target.value as typeof terrain)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              >
                <option value="chill">Chill</option>
                <option value="moderate">Moderate</option>
                <option value="rough">Rough</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Food cost (₹)</label>
              <input
                type="number"
                value={foodCost}
                onChange={(e) => setFoodCost(e.target.value)}
                min={0}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Entry cost (₹)</label>
              <input
                type="number"
                value={entryCost}
                onChange={(e) => setEntryCost(e.target.value)}
                min={0}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Best season</label>
              <input
                value={bestSeason}
                onChange={(e) => setBestSeason(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="e.g. Oct–Mar"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-mute mb-1">Best time of day</label>
              <input
                value={bestTimeOfDay}
                onChange={(e) => setBestTimeOfDay(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="e.g. Pre-dawn for sunrise"
              />
            </div>
          </div>
        </div>

        {/* Media */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Photos</h2>
          <div>
            <label className="block text-sm text-mute mb-1">Hero image URL</label>
            <input
              value={heroMediaUrl}
              onChange={(e) => setHeroMediaUrl(e.target.value)}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Gallery URLs (one per line, max 20)</label>
            <textarea
              value={galleryRaw}
              onChange={(e) => setGalleryRaw(e.target.value)}
              rows={3}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="https://...&#10;https://..."
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-semibold py-3 rounded-lg transition-colors"
        >
          {loading ? "Submitting…" : "Add destination"}
        </button>
      </form>
    </div>
  );
}
