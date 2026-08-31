"use client";
import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { TagListResponse } from "@/lib/api.types";
import { routes } from "@/lib/routes";
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from "@/components/ui";
import { cn } from "@/lib/cn";

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-mute">
        {label}
      </p>
      {hint && <p className="text-xs text-mute mt-1">{hint}</p>}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block mb-1.5 text-xs font-semibold text-body"
    >
      {children}
      {required && <span className="text-accent-gold ml-0.5">*</span>}
    </label>
  );
}

function TagChip({
  label,
  active,
  onToggle,
  accent = "gold",
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  accent?: "gold" | "blue";
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "text-xs px-3 py-1.5 rounded-full font-medium transition-colors duration-[120ms] border",
        active
          ? accent === "gold"
            ? "bg-accent-gold/15 border-accent-gold text-accent-gold"
            : "bg-accent-blue/15 border-accent-blue text-accent-blue"
          : "bg-surface-elevated border-hairline-strong text-mute hover:text-ink hover:border-accent-gold/40",
      )}
    >
      {label}
    </button>
  );
}

function NewDestinationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tags, setTags] = useState<TagListResponse>({ vibe: [], vehicle_fit: [] });

  const [name, setName] = useState(searchParams.get("name") || "");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [latitude, setLatitude] = useState(searchParams.get("latitude") || "");
  const [longitude, setLongitude] = useState(searchParams.get("longitude") || "");
  const [terrain, setTerrain] = useState<"chill" | "moderate" | "rough">(
    "moderate",
  );
  const [foodCost, setFoodCost] = useState("");
  const [entryCost, setEntryCost] = useState("");
  const [bestSeason, setBestSeason] = useState("");
  const [bestTimeOfDay, setBestTimeOfDay] = useState("");
  const [heroMediaUrl, setHeroMediaUrl] = useState("");
  const [galleryRaw, setGalleryRaw] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");

  useEffect(() => {
    api.listTags().then(setTags).catch(() => {
      /* tags are optional on submit */
    });
  }, []);

  const handleAutoGeocode = async () => {
    if (!name) return;
    setGeocoding(true);
    setGeocodeStatus("Searching coordinates…");
    try {
      const searchTerms = region ? `${name}, ${region}` : name;
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTerms)}&format=json&limit=1`,
        {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "RydrApp-DeveloperAgent",
          },
        },
      );
      if (!res.ok) throw new Error("Network response error");
      const data = await res.json();
      if (data && data.length > 0) {
        const item = data[0];
        setLatitude(parseFloat(item.lat).toFixed(6));
        setLongitude(parseFloat(item.lon).toFixed(6));
        setGeocodeStatus("Coordinates found.");
        if (!region && item.display_name) {
          const parts = item.display_name.split(", ");
          const statePart = parts[parts.length - 3] || parts[parts.length - 2];
          if (statePart) setRegion(statePart);
        }
      } else if (region) {
        const resFallback = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&limit=1`,
          {
            headers: {
              "Accept-Language": "en",
              "User-Agent": "RydrApp-DeveloperAgent",
            },
          },
        );
        const dataFallback = await resFallback.json();
        if (dataFallback && dataFallback.length > 0) {
          const item = dataFallback[0];
          setLatitude(parseFloat(item.lat).toFixed(6));
          setLongitude(parseFloat(item.lon).toFixed(6));
          setGeocodeStatus("Coordinates found (without region).");
          return;
        }
        setGeocodeStatus("No match. Enter coordinates by hand.");
      } else {
        setGeocodeStatus("No match. Enter coordinates by hand.");
      }
    } catch {
      setGeocodeStatus("Couldn't reach the geocoder. Try again in a moment.");
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
      setError(
        "Latitude and longitude are required. Use auto-detect or paste them from Google Maps.",
      );
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
    <div className="max-w-2xl mx-auto pb-16">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Add a destination
        </h1>
        <p className="text-sm text-mute mt-1.5">
          Share a spot you know. Riders will see it in Discover and can plan
          rides to it.
        </p>
      </header>

      {error && (
        <div className="mb-6">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basics */}
        <Card padding="default">
          <SectionHeader label="Basics" />
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="dest-name" required>
                Name
              </FieldLabel>
              <Input
                id="dest-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if (name && !latitude && !longitude) handleAutoGeocode();
                }}
                required
                maxLength={200}
                placeholder="Nandi Hills"
              />
              {name && (
                <button
                  type="button"
                  onClick={handleAutoGeocode}
                  disabled={geocoding}
                  className="mt-2 text-xs font-semibold text-accent-gold hover:underline underline-offset-4 disabled:opacity-50"
                >
                  {geocoding
                    ? "Detecting coordinates…"
                    : "Auto-detect coordinates from name →"}
                </button>
              )}
              {geocodeStatus && (
                <p className="text-xs text-mute mt-1">{geocodeStatus}</p>
              )}
            </div>

            <div>
              <FieldLabel htmlFor="dest-region">Region</FieldLabel>
              <Input
                id="dest-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                maxLength={100}
                placeholder="Karnataka"
              />
            </div>

            <div>
              <FieldLabel htmlFor="dest-description">Description</FieldLabel>
              <Textarea
                id="dest-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What makes it worth the ride?"
              />
            </div>
          </div>
        </Card>

        {/* Location */}
        <Card padding="default">
          <SectionHeader
            label="Location"
            hint="Copy from Google Maps or use auto-detect above."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="dest-lat" required>
                Latitude
              </FieldLabel>
              <Input
                id="dest-lat"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                required
                placeholder="13.3702"
              />
            </div>
            <div>
              <FieldLabel htmlFor="dest-lng" required>
                Longitude
              </FieldLabel>
              <Input
                id="dest-lng"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                required
                placeholder="77.6835"
              />
            </div>
          </div>
        </Card>

        {/* Tags */}
        <Card padding="default">
          <SectionHeader label="Tags" />
          <div className="space-y-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2">
                Vibe
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.vibe.map((t) => (
                  <TagChip
                    key={t.slug}
                    label={t.label}
                    active={selectedTags.has(t.slug)}
                    onToggle={() => toggle(t.slug)}
                    accent="gold"
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-mute mb-2">
                Vehicle fit
              </p>
              <div className="flex flex-wrap gap-2">
                {tags.vehicle_fit.map((t) => (
                  <TagChip
                    key={t.slug}
                    label={t.label}
                    active={selectedTags.has(t.slug)}
                    onToggle={() => toggle(t.slug)}
                    accent="blue"
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Practical info */}
        <Card padding="default">
          <SectionHeader label="Practical info" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel>Terrain</FieldLabel>
              <Select
                value={terrain}
                onValueChange={(v) => setTerrain(v as typeof terrain)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chill">Chill</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="rough">Rough</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="dest-food">Food cost (₹)</FieldLabel>
              <Input
                id="dest-food"
                type="number"
                value={foodCost}
                onChange={(e) => setFoodCost(e.target.value)}
                min={0}
                placeholder="250"
              />
            </div>
            <div>
              <FieldLabel htmlFor="dest-entry">Entry cost (₹)</FieldLabel>
              <Input
                id="dest-entry"
                type="number"
                value={entryCost}
                onChange={(e) => setEntryCost(e.target.value)}
                min={0}
                placeholder="50"
              />
            </div>
            <div>
              <FieldLabel htmlFor="dest-season">Best season</FieldLabel>
              <Input
                id="dest-season"
                value={bestSeason}
                onChange={(e) => setBestSeason(e.target.value)}
                placeholder="Oct–Mar"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="dest-time">Best time of day</FieldLabel>
              <Input
                id="dest-time"
                value={bestTimeOfDay}
                onChange={(e) => setBestTimeOfDay(e.target.value)}
                placeholder="Pre-dawn for sunrise"
              />
            </div>
          </div>
        </Card>

        {/* Media */}
        <Card padding="default">
          <SectionHeader label="Photos" hint="Optional — you can add these later." />
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="dest-hero">Hero image URL</FieldLabel>
              <Input
                id="dest-hero"
                value={heroMediaUrl}
                onChange={(e) => setHeroMediaUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <div>
              <FieldLabel htmlFor="dest-gallery">
                Gallery URLs (one per line, up to 20)
              </FieldLabel>
              <Textarea
                id="dest-gallery"
                value={galleryRaw}
                onChange={(e) => setGalleryRaw(e.target.value)}
                rows={3}
                placeholder={"https://…\nhttps://…"}
              />
            </div>
          </div>
        </Card>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="sm:min-w-[12rem]"
          >
            {loading ? (
              <>
                <Spinner size="sm" /> Submitting…
              </>
            ) : (
              "Add destination"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NewDestinationPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16">
          <Spinner size="lg" block />
        </div>
      }
    >
      <NewDestinationForm />
    </Suspense>
  );
}
