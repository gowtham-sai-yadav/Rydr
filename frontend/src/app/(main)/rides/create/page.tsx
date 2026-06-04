"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { DestinationSummary } from "@/lib/api.types";


function CreateRideForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Destination picker — fetched once on mount.
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(true);

  const [destinationId, setDestinationId] = useState(
    searchParams.get("destination") || "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedStartTime, setPlannedStartTime] = useState("");
  const [estimatedEndTime, setEstimatedEndTime] = useState("");
  const [visibility, setVisibility] = useState<"group" | "solo">("group");
  const [difficulty, setDifficulty] = useState<"easy" | "moderate" | "hard" | "expert">("moderate");
  const [recommendedBikeType, setRecommendedBikeType] = useState("");
  const [breakSchedule, setBreakSchedule] = useState("");
  const [maxRiders, setMaxRiders] = useState("10");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .listDestinations({ limit: 50 })
      .then((res) => setDestinations(res.destinations))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load destinations"))
      .finally(() => setDestinationsLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!destinationId) {
      setError("Please pick a destination");
      return;
    }
    setLoading(true);
    try {
      // Backend wants HH:MM:SS; <input type="time"> emits HH:MM — pad seconds.
      const padSeconds = (t: string) => (t.length === 5 ? `${t}:00` : t);
      const ride = await api.createRide({
        destination_id: destinationId,
        title,
        description: description || null,
        thumbnail_url: thumbnailUrl || null,
        planned_date: plannedDate,
        planned_start_time: padSeconds(plannedStartTime),
        estimated_end_time: estimatedEndTime ? padSeconds(estimatedEndTime) : null,
        visibility,
        difficulty_level: difficulty,
        recommended_bike_type: recommendedBikeType || null,
        break_schedule: breakSchedule || null,
        max_riders: parseInt(maxRiders) || 10,
      });
      router.push(`/rides/${ride.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ride");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-ink mb-6">Plan a Ride</h1>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Destination */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Destination</h2>
          <div>
            <label className="block text-sm text-mute mb-1">Where to? *</label>
            {destinationsLoading ? (
              <p className="text-stone text-sm">Loading destinations…</p>
            ) : (
              <select
                value={destinationId}
                onChange={(e) => setDestinationId(e.target.value)}
                required
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              >
                <option value="">— pick a destination —</option>
                {destinations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.region ? ` · ${d.region}` : ""}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-stone mt-1">
              Don&apos;t see your spot?{" "}
              <a href="/destinations/new" className="text-accent-gold hover:text-accent-gold">
                Add a destination
              </a>
              .
            </p>
            {destinationId && (
              <p className="text-xs text-stone mt-2">
                <a
                  href={`/journey/plan?destination=${destinationId}`}
                  className="text-accent-gold hover:text-accent-gold"
                >
                  Plan the route with waypoints →
                </a>
              </p>
            )}
          </div>
        </div>

        {/* Basic info */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Ride Details</h2>
          <div>
            <label className="block text-sm text-mute mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="e.g. Sunday sunrise to Nandi"
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="Pace, meet point, what to bring…"
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Thumbnail URL</label>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-mute mb-1">Date *</label>
              <input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                required
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Start *</label>
              <input
                type="time"
                value={plannedStartTime}
                onChange={(e) => setPlannedStartTime(e.target.value)}
                required
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">End (est.)</label>
              <input
                type="time"
                value={estimatedEndTime}
                onChange={(e) => setEstimatedEndTime(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-mute mb-1">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "group" | "solo")}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              >
                <option value="group">Group ride (others can join)</option>
                <option value="solo">Solo (just me)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Max riders</label>
              <input
                type="number"
                value={maxRiders}
                onChange={(e) => setMaxRiders(e.target.value)}
                min={1}
                max={50}
                disabled={visibility === "solo"}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-mute mb-1">Recommended bike type</label>
              <input
                value={recommendedBikeType}
                onChange={(e) => setRecommendedBikeType(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="e.g. Adventure, 150cc+"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Break schedule</label>
              <input
                value={breakSchedule}
                onChange={(e) => setBreakSchedule(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                placeholder="e.g. Tea at km 30"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || destinationsLoading}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-semibold py-3 rounded-lg transition-colors"
        >
          {loading ? "Creating ride…" : "Create Ride"}
        </button>
      </form>
    </div>
  );
}


export default function CreateRidePage() {
  // useSearchParams must be inside a Suspense boundary in app router.
  return (
    <Suspense fallback={<div className="text-mute text-center py-8">Loading…</div>}>
      <CreateRideForm />
    </Suspense>
  );
}
