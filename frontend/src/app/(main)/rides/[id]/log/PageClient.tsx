"use client";
import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  FlybyOut,
  RideLogCommentOut,
  RideLogOut,
  RidePlanOut,
} from "@/lib/api.types";
import { ShareCardButton } from "@/components/share/ShareCardButton";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


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

  // Comments
  const [comments, setComments] = useState<RideLogCommentOut[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // Flyby
  const [flybys, setFlybys] = useState<FlybyOut[]>([]);

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
      api
        .getRideLogComments(fresh.id)
        .then((res) => setComments(res.comments))
        .catch(() => {});
      if (fresh.recorded_track) {
        api
          .getFlybys(fresh.id)
          .then((res) => setFlybys(res.flybys))
          .catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride log");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const postComment = async () => {
    if (!log || !commentDraft.trim()) return;
    setPostingComment(true);
    try {
      const created = await api.addRideLogComment(log.id, commentDraft.trim());
      setComments((prev) => [...prev, created]);
      setCommentDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  const removeComment = async (commentId: string) => {
    if (!log) return;
    try {
      await api.deleteRideLogComment(log.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    }
  };

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
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!ride || !log) {
    return <div className="text-center py-12 text-mute">{error || "Couldn’t load this ride log."}</div>;
  }

  if (log.rider_id !== user?.id) {
    return (
      <div className="text-center py-12 text-mute">
        Only the rider can edit their own log.{" "}
        <Link href={`/rides/${id}`} className="text-accent-gold">Back to ride</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <Link href={`/rides/${ride.id}`} className="text-accent-gold hover:text-accent-gold text-sm">
          ← {ride.title}
        </Link>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-2xl font-bold text-ink">Log this ride</h1>
          <ShareCardButton
            fetchImage={() => api.getRideLogCardImage(log.id)}
            fileName={`rydr-ride-${ride.id}`}
            shareTitle={ride.title}
            shareText={`Check out my ride to ${ride.destination?.name ?? "somewhere great"} on Rydr`}
          />
        </div>
        {ride.destination && (
          <p className="text-mute text-sm">at {ride.destination.name}</p>
        )}
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {log.new_personal_records.length > 0 && (
        <div className="border border-accent-gold/40 bg-accent-gold/10 text-accent-gold px-4 py-3 rounded-lg text-sm font-semibold">
          🏆 New personal record{log.new_personal_records.length > 1 ? "s" : ""}: {log.new_personal_records.join(", ")}
        </div>
      )}

      {(log.distance_km != null || log.relative_effort != null) && (
        <div className="bg-surface-card rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-ink">Ride stats</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {log.distance_km != null && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Distance</p>
                <p className="text-ink font-semibold">{log.distance_km.toFixed(1)} km</p>
              </div>
            )}
            {log.moving_duration_seconds != null && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Moving time</p>
                <p className="text-ink font-semibold">{formatDuration(log.moving_duration_seconds)}</p>
              </div>
            )}
            {log.avg_speed_kmh != null && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Avg speed</p>
                <p className="text-ink font-semibold">{log.avg_speed_kmh.toFixed(0)} km/h</p>
              </div>
            )}
            {log.elevation_gain_m != null && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Elevation gain</p>
                <p className="text-ink font-semibold">{log.elevation_gain_m.toFixed(0)} m</p>
              </div>
            )}
            {log.terrain_type && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Terrain</p>
                <p className="text-ink font-semibold capitalize">{log.terrain_type}</p>
              </div>
            )}
            {log.relative_effort != null && (
              <div>
                <p className="text-xs text-mute uppercase tracking-wide">Relative effort</p>
                <p className="text-accent-gold font-semibold">{log.relative_effort} / 100</p>
              </div>
            )}
          </div>
          {log.matched_route_id && (
            <p className="text-xs text-mute pt-2 border-t border-hairline-strong">
              Matched to a saved route —{" "}
              <Link href={`/journey/plan?route_id=${log.matched_route_id}`} className="text-accent-gold">
                view route
              </Link>
            </p>
          )}
          {flybys.length > 0 && (
            <div className="pt-3 border-t border-hairline-strong space-y-2">
              <p className="text-xs text-mute uppercase tracking-wide">Riders who crossed your path</p>
              {flybys.map((f) => (
                <Link
                  key={f.other_ride_log_id}
                  href={`/users/${f.rider.id}`}
                  className="flex items-center gap-2 text-sm hover:opacity-80"
                >
                  <div className="w-6 h-6 rounded-full bg-ink text-canvas flex items-center justify-center text-[10px] font-bold">
                    {f.rider.name.charAt(0)}
                  </div>
                  <span className="text-ink">{f.rider.name}</span>
                  <span className="text-mute text-xs">— {(f.closest_distance_km * 1000).toFixed(0)}m away</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Feedback */}
      <div className="bg-surface-card rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">How did it go?</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-mute mb-1">Total cost (₹)</label>
            <input
              type="number"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              min={0}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Road condition</label>
            <select
              value={roadCondition}
              onChange={(e) => setRoadCondition(e.target.value as typeof roadCondition)}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            >
              <option value="">—</option>
              <option value="good">Good</option>
              <option value="ok">OK</option>
              <option value="rough">Rough</option>
              <option value="bad">Bad</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Recommend?</label>
            <select
              value={recommended}
              onChange={(e) => setRecommended(e.target.value as typeof recommended)}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            >
              <option value="">—</option>
              <option value="yes">Yes — go for it</option>
              <option value="no">No, skip it</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-mute mb-1">Ended at</label>
            <input
              type="datetime-local"
              value={endTs}
              onChange={(e) => setEndTs(e.target.value)}
              className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm text-mute mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={5000}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            placeholder="Highlights, gotchas, what you'd tell a friend…"
          />
        </div>
        <button
          onClick={saveFeedback}
          disabled={savingPatch}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-medium py-2.5 rounded-lg"
        >
          {savingPatch ? "Saving…" : "Save feedback"}
        </button>
      </div>

      {/* Media */}
      <div className="bg-surface-card rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Photos & videos</h2>

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
                  className="absolute top-1 right-1 bg-accent-red/80 hover:bg-accent-red text-ink text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm text-mute mb-1">Upload (image or video)</label>
          <input
            type="file"
            accept="image/*,video/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
            className="block w-full text-sm text-body file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-ink file:text-canvas file:font-medium file:cursor-pointer hover:file:bg-surface-light disabled:opacity-50"
          />
          {uploading && <p className="text-xs text-mute mt-2">Uploading…</p>}
        </div>

        <div className="border-t border-hairline-strong pt-3">
          <label className="block text-sm text-mute mb-1">Or paste an image URL</label>
          <div className="flex gap-2">
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://..."
              className="flex-1 bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
            />
            <button
              onClick={confirmManualUrl}
              disabled={uploading || !manualUrl.trim()}
              className="bg-surface-elevated hover:bg-surface-elevated disabled:opacity-50 text-ink px-4 py-2 rounded-lg text-sm font-medium"
            >
              Attach
            </button>
          </div>
        </div>
      </div>

      {/* Rating */}
      <div className="bg-surface-card rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">
          Rate this destination
        </h2>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              className={`text-3xl transition-colors ${
                n <= stars ? "text-accent-gold" : "text-gray-600 hover:text-stone"
              }`}
            >
              ★
            </button>
          ))}
          {stars > 0 && <span className="text-mute text-sm ml-2">{stars} / 5</span>}
        </div>
        <div>
          <label className="block text-sm text-mute mb-1">Review (optional)</label>
          <textarea
            value={review}
            onChange={(e) => setReview(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
            placeholder="What worked, what didn't…"
          />
        </div>
        <button
          onClick={saveRating}
          disabled={savingRating || stars < 1}
          className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 font-medium py-2.5 rounded-lg"
        >
          {savingRating
            ? "Submitting…"
            : log.rating
              ? "Update rating"
              : "Submit rating"}
        </button>
      </div>

      {/* Comments */}
      <div className="bg-surface-card rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">Comments</h2>
        {comments.length === 0 && <p className="text-mute text-sm">No comments yet.</p>}
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink">
                  <span className="font-semibold">{c.author.name}</span>{" "}
                  <span className="text-mute">{c.body}</span>
                </p>
              </div>
              {c.author.id === user?.id && (
                <button
                  onClick={() => removeComment(c.id)}
                  className="text-xs text-mute hover:text-accent-red shrink-0"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2 border-t border-hairline-strong">
          <input
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Add a comment…"
            maxLength={2000}
            className="flex-1 bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm focus:outline-none focus:ring-2 focus:ring-ink/30"
            onKeyDown={(e) => {
              if (e.key === "Enter") postComment();
            }}
          />
          <button
            onClick={postComment}
            disabled={postingComment || !commentDraft.trim()}
            className="bg-accent-gold text-canvas disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Post
          </button>
        </div>
      </div>

      <Link
        href={`/destinations/${ride.destination_id}`}
        className="block text-center text-accent-gold hover:text-accent-gold text-sm py-2"
      >
        See the destination page →
      </Link>
    </div>
  );
}
