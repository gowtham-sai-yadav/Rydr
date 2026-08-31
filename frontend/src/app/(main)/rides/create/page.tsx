"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { DestinationSummary } from "@/lib/api.types";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { DestinationAutocomplete } from "@/components/destinations/DestinationAutocomplete";
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

// One consistent header on every form section — small caps eyebrow above,
// the section body underneath. Keeps rides/create / destinations/new /
// rides/log visually the same shape.
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

function CreateRideForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
  const [difficulty, setDifficulty] = useState<
    "easy" | "moderate" | "hard" | "expert"
  >("moderate");
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
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load destinations"),
      )
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
        max_riders:
          visibility === "solo"
            ? 1
            : noRiderLimit
              ? null
              : parseInt(maxRiders) || 10,
        requires_approval: requiresApproval,
        recommended_bike_type: recommendedBikeType || null,
        break_schedule: breakSchedule || null,
        route_id: routeId || null,
      });
      router.push(routes.ride(ride.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ride");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-16">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Plan a ride
        </h1>
        <p className="text-sm text-mute mt-1.5">
          Pick a destination, pick a time. Riders can find and join it from the
          feed.
        </p>
      </header>

      {error && (
        <div className="mb-6">
          <Alert variant="destructive">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Destination */}
        <Card padding="default">
          <SectionHeader label="Destination" />
          <FieldLabel required>Where to?</FieldLabel>
          <DestinationAutocomplete
            destinations={destinations}
            loading={destinationsLoading}
            value={destinationId}
            onChange={setDestinationId}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs">
            <span className="text-mute">
              Not in the list?{" "}
              <Link
                href="/destinations/new"
                className="text-accent-gold hover:underline underline-offset-4 font-medium"
              >
                Add a destination
              </Link>
            </span>
            {destinationId && (
              <span>
                {routeId ? (
                  <span className="text-accent-green font-medium">
                    ✓ Route attached
                  </span>
                ) : (
                  <Link
                    href={`/journey/plan?destination=${destinationId}`}
                    className="text-accent-gold hover:underline underline-offset-4 font-medium"
                  >
                    Plan a route →
                  </Link>
                )}
              </span>
            )}
          </div>
        </Card>

        {/* Basic info */}
        <Card padding="default">
          <SectionHeader label="Ride details" />
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="ride-title" required>
                Title
              </FieldLabel>
              <Input
                id="ride-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                maxLength={200}
                placeholder="Sunday sunrise to Nandi"
              />
            </div>
            <div>
              <FieldLabel htmlFor="ride-description">Description</FieldLabel>
              <Textarea
                id="ride-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Pace, meet point, what to bring…"
              />
            </div>
            <div>
              <FieldLabel htmlFor="ride-thumbnail">Thumbnail URL</FieldLabel>
              <Input
                id="ride-thumbnail"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
        </Card>

        {/* Schedule */}
        <Card padding="default">
          <SectionHeader label="Schedule" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel required>Date</FieldLabel>
              <DatePicker
                value={plannedDate}
                onChange={setPlannedDate}
                required
                aria-label="Ride date"
              />
            </div>
            <div>
              <FieldLabel required>Start</FieldLabel>
              <TimePicker
                value={plannedStartTime}
                onChange={setPlannedStartTime}
                required
                aria-label="Ride start time"
              />
            </div>
            <div>
              <FieldLabel>End (est.)</FieldLabel>
              <TimePicker
                value={estimatedEndTime}
                onChange={setEstimatedEndTime}
                aria-label="Ride estimated end time"
              />
            </div>
          </div>
        </Card>

        {/* Configuration */}
        <Card padding="default">
          <SectionHeader label="Who can join" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <FieldLabel>Visibility</FieldLabel>
              <Select
                value={visibility}
                onValueChange={(v) => setVisibility(v as "group" | "solo")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group ride</SelectItem>
                  <SelectItem value="solo">Solo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel>Difficulty</FieldLabel>
              <Select
                value={difficulty}
                onValueChange={(v) =>
                  setDifficulty(v as typeof difficulty)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="ride-max">Max riders</FieldLabel>
              <Input
                id="ride-max"
                type="number"
                value={maxRiders}
                onChange={(e) => setMaxRiders(e.target.value)}
                min={1}
                max={200}
                disabled={visibility === "solo" || noRiderLimit}
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

          <label className="flex items-start gap-3 mt-5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              disabled={visibility === "solo"}
              className="mt-0.5 rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30 disabled:opacity-50"
            />
            <span>
              <span className="block text-sm text-ink font-medium">
                Require approval to join
              </span>
              <span className="block text-xs text-mute mt-0.5">
                {requiresApproval
                  ? "Riders request to join; you approve or reject each one."
                  : "Anyone who taps Join is in immediately, capacity permitting."}
              </span>
            </span>
          </label>
        </Card>

        {/* Optional details */}
        <Card padding="default">
          <SectionHeader label="Optional" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="ride-bike">
                Recommended bike type
              </FieldLabel>
              <Input
                id="ride-bike"
                value={recommendedBikeType}
                onChange={(e) => setRecommendedBikeType(e.target.value)}
                placeholder="Adventure, 150cc+…"
              />
            </div>
            <div>
              <FieldLabel htmlFor="ride-break">Break schedule</FieldLabel>
              <Input
                id="ride-break"
                value={breakSchedule}
                onChange={(e) => setBreakSchedule(e.target.value)}
                placeholder="Tea at km 30"
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
            disabled={loading || destinationsLoading}
            className="sm:min-w-[10rem]"
          >
            {loading ? (
              <>
                <Spinner size="sm" /> Creating…
              </>
            ) : (
              "Create ride"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function CreateRidePage() {
  return (
    <Suspense
      fallback={
        <div className="text-mute text-center py-16">
          <Spinner size="lg" block />
        </div>
      }
    >
      <CreateRideForm />
    </Suspense>
  );
}
