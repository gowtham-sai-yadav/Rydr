"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { DestinationSummary } from "@/lib/api.types";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { DestinationAutocomplete } from "@/components/destinations/DestinationAutocomplete";


function CreateRideForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Destination picker — fetched once on mount.
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [destinationsLoading, setDestinationsLoading] = useState(true);

  const [destinationId, setDestinationId] = useState(
    searchParams.get("destination") || "",
  );
  const routeId = searchParams.get("route_id") || "";
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
  const [noRiderLimit, setNoRiderLimit] = useState(false);
  const [requiresApproval, setRequiresApproval] = useState(true);

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
        max_riders: visibility === "solo" ? 1 : noRiderLimit ? null : parseInt(maxRiders) || 10,
        requires_approval: requiresApproval,
        recommended_bike_type: recommendedBikeType || null,
        break_schedule: breakSchedule || null,
        route_id: routeId || null,
      });
      router.push(`/rides/${ride.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ride");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-16 relative">
      <div className="text-center sm:text-left">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Plan a Ride</h1>
        <p className="text-xs text-mute font-semibold tracking-wider uppercase mt-1 select-none">Establish a new telemetry log and recruit other riders</p>
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Destination */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Destination</h2>
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Where to? *</label>
            <DestinationAutocomplete
              destinations={destinations}
              loading={destinationsLoading}
              value={destinationId}
              onChange={setDestinationId}
            />
            <div className="flex justify-between items-center mt-2 flex-wrap gap-2">
              <p className="text-[10px] text-stone font-semibold tracking-wide uppercase select-none">
                Don&apos;t see your spot?{" "}
                <a href="/destinations/new" className="text-accent-gold hover:underline">
                  Add a destination
                </a>
              </p>
              {destinationId && (
                <p className="text-[10px] font-semibold tracking-wide uppercase select-none">
                  {routeId ? (
                    <span className="text-accent-green">✓ Route attached</span>
                  ) : (
                    <a
                      href={`/journey/plan?destination=${destinationId}`}
                      className="text-accent-gold hover:underline"
                    >
                      Plan route waypoints →
                    </a>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Basic info */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Ride Details</h2>
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="e.g. Sunday sunrise to Nandi"
            />
          </div>
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="Pace, meet point, what to bring…"
            />
          </div>
          <div>
            <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Thumbnail URL</label>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Schedule */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-green/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Date *</label>
              <DatePicker
                value={plannedDate}
                onChange={setPlannedDate}
                required
                aria-label="Ride date"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Start *</label>
              <TimePicker
                value={plannedStartTime}
                onChange={setPlannedStartTime}
                required
                aria-label="Ride start time"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">End (est.)</label>
              <TimePicker
                value={estimatedEndTime}
                onChange={setEstimatedEndTime}
                aria-label="Ride estimated end time"
              />
            </div>
          </div>
        </div>

        {/* Configuration */}
        <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-orange/20 to-transparent" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Visibility</label>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as "group" | "solo")}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              >
                <option value="group" className="bg-canvas text-ink">Group ride (public)</option>
                <option value="solo" className="bg-canvas text-ink">Solo (just me)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
              >
                <option value="easy" className="bg-canvas text-ink">Easy</option>
                <option value="moderate" className="bg-canvas text-ink">Moderate</option>
                <option value="hard" className="bg-canvas text-ink">Hard</option>
                <option value="expert" className="bg-canvas text-ink">Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Max riders</label>
              <input
                type="number"
                value={maxRiders}
                onChange={(e) => setMaxRiders(e.target.value)}
                min={1}
                max={200}
                disabled={visibility === "solo" || noRiderLimit}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm disabled:opacity-50 focus:outline-none transition-all duration-200"
              />
              <label className="flex items-center gap-2 mt-2 text-xs text-mute select-none">
                <input
                  type="checkbox"
                  checked={noRiderLimit}
                  onChange={(e) => setNoRiderLimit(e.target.checked)}
                  disabled={visibility === "solo"}
                  className="rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30 disabled:opacity-50"
                />
                No limit
              </label>
            </div>
          </div>
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={requiresApproval}
                onChange={(e) => setRequiresApproval(e.target.checked)}
                disabled={visibility === "solo"}
                className="mt-0.5 rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30 disabled:opacity-50"
              />
              <span>
                <span className="block text-xs text-ink font-semibold uppercase tracking-wider">
                  Require approval to join
                </span>
                <span className="block text-[11px] text-mute mt-0.5">
                  {requiresApproval
                    ? "Riders request to join and you approve or reject each one."
                    : "Anyone who taps “Join” is in immediately — no approval step, capacity permitting."}
                </span>
              </span>
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Recommended bike type</label>
              <input
                value={recommendedBikeType}
                onChange={(e) => setRecommendedBikeType(e.target.value)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. Adventure, 150cc+"
              />
            </div>
            <div>
              <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-2">Break schedule</label>
              <input
                value={breakSchedule}
                onChange={(e) => setBreakSchedule(e.target.value)}
                className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2.5 text-ink text-sm focus:outline-none transition-all duration-200"
                placeholder="e.g. Tea at km 30"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || destinationsLoading}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-bold py-3.5 rounded-xl uppercase text-xs tracking-wider transition-all duration-200 shadow-[0_4px_14px_rgba(212,175,55,0.15)]"
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
