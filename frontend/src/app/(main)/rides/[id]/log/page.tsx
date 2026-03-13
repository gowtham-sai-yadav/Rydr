"use client";
import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  RideLogOut,
  RidePlanOut,
} from "@/lib/api.types";


export default function RideLogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [ride, setRide] = useState<RidePlanOut | null>(null);
  const [log, setLog] = useState<RideLogOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editable form state
  const [actualCost, setActualCost] = useState("");
  const [roadCondition, setRoadCondition] = useState<"good" | "ok" | "rough" | "bad" | "">("");
  const [recommended, setRecommended] = useState<"yes" | "no" | "">("");
  const [notes, setNotes] = useState("");
  const [endTs, setEndTs] = useState("");
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [savingPatch, setSavingPatch] = useState(false);
  const [savingRating, setSavingRating] = useState(false);

  // Media upload state
  const [uploading, setUploading] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  const reload = useCallback(async () => {
    try {
      // Load ride first to know destination + check membership
      const r = await api.getRide(id);
      setRide(r);
      // Then ensure (idempotent) the caller has a log for this ride
      const fresh = await api.createRideLog({ ride_plan_id: id });
      setLog(fresh);
      // Populate form fields from existing log
      setActualCost(fresh.actual_cost?.toString() ?? "");
      setRoadCondition(fresh.road_condition ?? "");
      setRecommended(fresh.recommended === true ? "yes" : fresh.recommended === false ? "no" : "");
      setNotes(fresh.notes ?? "");
      setEndTs(fresh.actual_end_ts ? fresh.actual_end_ts.slice(0, 16) : "");
      if (fresh.rating) {
        setStars(fresh.rating.stars);
        setReview(fresh.rating.review ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride log");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saveFeedback = async () => {
    if (!log) return;
    setSavingPatch(true);
    setError("");
    try {
      const fresh = await api.updateRideLog(log.id, {
        actual_cost: actualCost ? parseInt(actualCost) : null,
        road_condition: roadCondition || null,
        recommended: recommended === "yes" ? true : recommended === "no" ? false : null,
        notes: notes || null,
        actual_end_ts: endTs ? new Date(endTs).toISOString() : null,
      });
      setLog(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPatch(false);
    }
  };

  const saveRating = async () => {
    if (!ride || !log || stars < 1) return;
    setSavingRating(true);
    setError("");
    try {
      await api.submitRating(ride.destination_id, {
        stars,
        review: review || undefined,
        ride_log_id: log.id,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSavingRating(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!log) return;
    setUploading(true);
    setError("");
    try {
      // 1. Ask backend for a signed Cloudinary upload payload.
      const sig = await api.signRideMedia(log.id);

      // 2. Validate size client-side using the limits the server returned.
      const isImage = file.type.startsWith("image/");
      const maxBytes = isImage ? sig.max_image_bytes : sig.max_video_bytes;
      if (file.size > maxBytes) {
        throw new Error(
          `File too large — limit is ${Math.round(maxBytes / 1024 / 1024)} MB.`,
        );
      }

      // 3. POST directly to Cloudinary with the signed form fields.
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sig.api_key);
      fd.append("timestamp", String(sig.timestamp));
      fd.append("signature", sig.signature);
      fd.append("folder", sig.folder);
      const cloudRes = await fetch(sig.upload_url, {
        method: "POST",
        body: fd,
      });
      if (!cloudRes.ok) {
        const body = await cloudRes.json().catch(() => ({}));
        throw new Error(`Cloudinary upload failed: ${body?.error?.message || cloudRes.status}`);
      }
      const cloudData = (await cloudRes.json()) as {
        secure_url: string;
        resource_type: string;
      };

      // 4. Confirm with our backend — also writes a DestinationMedia row
      // back to the destination (the M4 flywheel).
      await api.confirmRideMedia(log.id, {
        url: cloudData.secure_url,
        media_type: cloudData.resource_type === "video" ? "video" : "image",
        link_to_destination: true,
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const confirmManualUrl = async () => {
    if (!log || !manualUrl.trim()) return;
    setUploading(true);
    setError("");
    try {
      await api.confirmRideMedia(log.id, {
        url: manualUrl.trim(),
        media_type: "image",
        link_to_destination: true,
      });
      setManualUrl("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach URL");
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async (mediaId: string) => {
    if (!log) return;
    if (!confirm("Remove this photo?")) return;
    try {
      await api.deleteRideMedia(log.id, mediaId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
      </div>
    );
  }

  if (!ride || !log) {
    return <div className="text-center py-12 text-gray-400">{error || "Couldn’t load this ride log."}</div>;
  }

  if (log.rider_id !== user?.id) {
    return (
      <div className="text-center py-12 text-gray-400">
        Only the rider can edit their own log.{" "}
        <Link href={`/rides/${id}`} className="text-orange-500">Back to ride</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <Link href={`/rides/${ride.id}`} className="text-orange-500 hover:text-orange-400 text-sm">
          ← {ride.title}
        </Link>
        <h1 className="text-2xl font-bold text-white mt-1">Log this ride</h1>
        {ride.destination && (
          <p className="text-gray-400 text-sm">at {ride.destination.name}</p>
        )}
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Feedback */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">How did it go?</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Total cost (₹)</label>
            <input
              type="number"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              min={0}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Road condition</label>
            <select
              value={roadCondition}
              onChange={(e) => setRoadCondition(e.target.value as typeof roadCondition)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">—</option>
              <option value="good">Good</option>
              <option value="ok">OK</option>
              <option value="rough">Rough</option>
              <option value="bad">Bad</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Recommend?</label>
            <select
              value={recommended}
              onChange={(e) => setRecommended(e.target.value as typeof recommended)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">—</option>
              <option value="yes">Yes — go for it</option>
              <option value="no">No, skip it</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Ended at</label>
            <input
              type="datetime-local"
              value={endTs}
              onChange={(e) => setEndTs(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="Highlights, gotchas, what you'd tell a friend…"
          />
        </div>
        <button
          onClick={saveFeedback}
          disabled={savingPatch}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
        >
          {savingPatch ? "Saving…" : "Save feedback"}
        </button>
      </div>

      {/* Media */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Photos & videos</h2>

        {log.media.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {log.media.map((m) => (
              <div key={m.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt={m.caption || "ride media"}
                  className="w-full aspect-square object-cover rounded-lg"
                />
                <button
                  onClick={() => removeMedia(m.id)}
                  className="absolute top-1 right-1 bg-red-600/80 hover:bg-red-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm text-gray-400 mb-1">Upload (image or video)</label>
          <input
            type="file"
            accept="image/*,video/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
            className="block w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-600 file:text-white file:font-medium file:cursor-pointer hover:file:bg-orange-700 disabled:opacity-50"
          />
          {uploading && <p className="text-xs text-gray-400 mt-2">Uploading…</p>}
        </div>

        <div className="border-t border-gray-700 pt-3">
          <label className="block text-sm text-gray-400 mb-1">Or paste an image URL</label>
          <div className="flex gap-2">
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={confirmManualUrl}
              disabled={uploading || !manualUrl.trim()}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Attach
            </button>
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="bg-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Rate this destination
        </h2>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              className={`text-3xl transition-colors ${
                n <= stars ? "text-yellow-400" : "text-gray-600 hover:text-gray-500"
              }`}
            >
              ★
            </button>
          ))}
          {stars > 0 && <span className="text-gray-400 text-sm ml-2">{stars} / 5</span>}
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Review (optional)</label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            placeholder="What worked, what didn't…"
          />
        </div>
        <button
          onClick={saveRating}
          disabled={savingRating || stars < 1}
          className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg"
        >
          {savingRating
            ? "Submitting…"
            : log.rating
              ? "Update rating"
              : "Submit rating"}
        </button>
      </div>

      <Link
        href={`/destinations/${ride.destination_id}`}
        className="block text-center text-orange-500 hover:text-orange-400 text-sm py-2"
      >
        See the destination page →
      </Link>
    </div>
  );
}
