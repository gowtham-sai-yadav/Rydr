"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface StopForm {
  name: string;
  description: string;
  latitude: string;
  longitude: string;
  is_break_stop: boolean;
}

export default function CreateRidePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [rideDate, setRideDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [difficulty, setDifficulty] = useState("moderate");
  const [bikeType, setBikeType] = useState("");
  const [breakSchedule, setBreakSchedule] = useState("");
  const [maxRiders, setMaxRiders] = useState("10");
  const [stops, setStops] = useState<StopForm[]>([
    { name: "", description: "", latitude: "", longitude: "", is_break_stop: false },
  ]);

  const addStop = () => {
    setStops([...stops, { name: "", description: "", latitude: "", longitude: "", is_break_stop: false }]);
  };

  const removeStop = (index: number) => {
    if (stops.length === 1) return;
    setStops(stops.filter((_, i) => i !== index));
  };

  const updateStop = (index: number, field: keyof StopForm, value: string | boolean) => {
    const updated = [...stops];
    updated[index] = { ...updated[index], [field]: value };
    setStops(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.createRide({
        title,
        description: description || null,
        thumbnail_url: thumbnailUrl || null,
        ride_date: rideDate,
        start_time: startTime,
        estimated_end_time: endTime || null,
        difficulty_level: difficulty,
        recommended_bike_type: bikeType || null,
        break_schedule: breakSchedule || null,
        max_riders: parseInt(maxRiders) || 10,
        stops: stops
          .filter((s) => s.name.trim())
          .map((s, i) => ({
            name: s.name,
            description: s.description || null,
            stop_order: i + 1,
            latitude: s.latitude ? parseFloat(s.latitude) : null,
            longitude: s.longitude ? parseFloat(s.longitude) : null,
            is_break_stop: s.is_break_stop,
          })),
      });
      const ride = res as { id: string };
      router.push(`/rides/${ride.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ride");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Create a Ride</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Info */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Ride Details</h2>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g. Pacific Coast Sunrise Run"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Describe the ride experience..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Thumbnail URL</label>
            <input
              value={thumbnailUrl}
              onChange={(e) => setThumbnailUrl(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="https://images.unsplash.com/..."
            />
          </div>
        </div>

        {/* Timing */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Schedule</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Date *</label>
              <input
                type="date"
                value={rideDate}
                onChange={(e) => setRideDate(e.target.value)}
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
        </div>

        {/* Ride Config */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Configuration</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="easy">Easy</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
                <option value="expert">Expert</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bike Type</label>
              <input
                value={bikeType}
                onChange={(e) => setBikeType(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="e.g. Sport / Naked"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Max Riders</label>
              <input
                type="number"
                value={maxRiders}
                onChange={(e) => setMaxRiders(e.target.value)}
                min={2}
                max={50}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Break Schedule</label>
            <input
              value={breakSchedule}
              onChange={(e) => setBreakSchedule(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="e.g. Coffee break at mile 30, lunch at endpoint"
            />
          </div>
        </div>

        {/* Stops */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Stops</h2>
            <button
              type="button"
              onClick={addStop}
              className="text-orange-500 hover:text-orange-400 text-sm font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Stop
            </button>
          </div>

          {stops.map((stop, i) => (
            <div key={i} className="bg-gray-700/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-orange-500">Stop {i + 1}</span>
                {stops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeStop(i)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={stop.name}
                  onChange={(e) => updateStop(i, "name", e.target.value)}
                  placeholder="Stop name *"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={stop.description}
                  onChange={(e) => updateStop(i, "description", e.target.value)}
                  placeholder="Description"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-center">
                <input
                  value={stop.latitude}
                  onChange={(e) => updateStop(i, "latitude", e.target.value)}
                  placeholder="Latitude"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <input
                  value={stop.longitude}
                  onChange={(e) => updateStop(i, "longitude", e.target.value)}
                  placeholder="Longitude"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={stop.is_break_stop}
                    onChange={(e) => updateStop(i, "is_break_stop", e.target.checked)}
                    className="rounded border-gray-600 text-orange-500 focus:ring-orange-500"
                  />
                  Break stop
                </label>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {loading ? "Creating ride..." : "Create Ride"}
        </button>
      </form>
    </div>
  );
}
