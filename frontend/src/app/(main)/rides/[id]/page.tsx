"use client";
import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  ParticipantStatus,
  RidePlanOut,
  RidePlanParticipantOut,
} from "@/lib/api.types";


const difficultyColors: Record<string, string> = {
  easy: "bg-accent-green",
  moderate: "bg-accent-yellow",
  hard: "bg-ink text-canvas",
  expert: "bg-accent-red",
};

const statusColors: Record<string, string> = {
  planned: "bg-accent-gold",
  in_progress: "bg-ink text-canvas",
  completed: "bg-green-700",
  cancelled: "bg-accent-red",
};


export default function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();

  const [ride, setRide] = useState<RidePlanOut | null>(null);
  const [participants, setParticipants] = useState<RidePlanParticipantOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showParticipants, setShowParticipants] = useState(false);

  const isCaptain = !!user && !!ride && user.id === ride.captain_id;
  const myParticipation = ride?.participants.find((p) => p.user_id === user?.id);
  const myStatus: ParticipantStatus | null = myParticipation?.status ?? null;

  const reload = useCallback(async () => {
    try {
      const r = await api.getRide(id);
      setRide(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const loadParticipants = async () => {
    try {
      const data = await api.getParticipants(id);
      setParticipants(data.participants);
      setShowParticipants(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load participants");
    }
  };

  const handleJoin = async () => {
    setBusy(true);
    setError("");
    try {
      await api.joinRide(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    setBusy(true);
    setError("");
    try {
      await api.leaveRide(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave");
    } finally {
      setBusy(false);
    }
  };

  const handleStart = async () => {
    setBusy(true);
    setError("");
    try {
      await api.startRide(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    setError("");
    try {
      await api.completeRide(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Cancel this ride? Participants will not be able to join.")) return;
    setBusy(true);
    setError("");
    try {
      await api.cancelRide(id);
      router.push("/rides");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
      setBusy(false);
    }
  };

  const handleParticipantAction = async (userId: string, status: "approved" | "rejected") => {
    try {
      await api.updateParticipant(id, userId, status);
      await loadParticipants();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update participant");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!ride) {
    return <div className="text-center py-12 text-mute">Ride not found</div>;
  }

  const showLogLink =
    !!user &&
    (isCaptain || myStatus === "approved") &&
    (ride.status === "in_progress" || ride.status === "completed");

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Hero */}
      <div className="relative rounded-xl overflow-hidden h-64 bg-surface-card">
        {ride.thumbnail_url || ride.destination?.hero_media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ride.thumbnail_url || ride.destination?.hero_media_url || ""}
            alt={ride.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`${difficultyColors[ride.difficulty_level] || "bg-gray-600"} text-ink text-xs px-2 py-1 rounded-full font-medium capitalize`}>
              {ride.difficulty_level}
            </span>
            <span className={`${statusColors[ride.status] || "bg-gray-600"} text-ink text-xs px-2 py-1 rounded-full font-medium capitalize`}>
              {ride.status.replace("_", " ")}
            </span>
            <span className="bg-surface-elevated text-ink text-xs px-2 py-1 rounded-full font-medium capitalize">
              {ride.visibility}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-ink">{ride.title}</h1>
        </div>
      </div>

      {/* Destination + Captain */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ride.destination && (
          <Link
            href={`/destinations/${ride.destination.id}`}
            className="bg-surface-card rounded-xl p-4 hover:bg-surface-elevated transition-colors"
          >
            <p className="text-xs text-mute uppercase mb-1">Destination</p>
            <p className="text-ink font-semibold">{ride.destination.name}</p>
            {ride.destination.region && (
              <p className="text-mute text-sm">{ride.destination.region}</p>
            )}
          </Link>
        )}
        {ride.captain && (
          <Link
            href={`/users/${ride.captain.id}`}
            className="bg-surface-card rounded-xl p-4 flex items-center gap-4 hover:bg-surface-elevated transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-ink text-canvas flex items-center justify-center text-lg font-bold">
              {ride.captain.name.charAt(0)}
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Captain</p>
              <p className="text-ink font-semibold">{ride.captain.name}</p>
            </div>
          </Link>
        )}
      </div>

      {/* Details */}
      <div className="bg-surface-card rounded-xl p-6">
        {ride.description && <p className="text-body mb-4">{ride.description}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-mute uppercase">Date</p>
            <p className="text-ink font-medium">{ride.planned_date}</p>
          </div>
          <div>
            <p className="text-xs text-mute uppercase">Time</p>
            <p className="text-ink font-medium">
              {ride.planned_start_time.slice(0, 5)}
              {ride.estimated_end_time ? ` – ${ride.estimated_end_time.slice(0, 5)}` : ""}
            </p>
          </div>
          <div>
            <p className="text-xs text-mute uppercase">Bike type</p>
            <p className="text-ink font-medium">{ride.recommended_bike_type || "Any"}</p>
          </div>
          <div>
            <p className="text-xs text-mute uppercase">Riders</p>
            <p className="text-ink font-medium">
              {ride.participant_count} / {ride.max_riders}
            </p>
          </div>
        </div>
        {ride.break_schedule && (
          <div className="mt-4 pt-4 border-t border-hairline-strong">
            <p className="text-xs text-mute uppercase mb-1">Break schedule</p>
            <p className="text-body text-sm">{ride.break_schedule}</p>
          </div>
        )}
      </div>

      {/* Quick links — chat is only reachable for captain + approved participants
          (backend returns 404 for pending/rejected/non-members to avoid leaking
          the group's existence). Hide the link rather than letting users tap
          into a 404. */}
      <div className="flex flex-wrap gap-3">
        {ride.chat_group_id && (isCaptain || myStatus === "approved") && (
          <Link
            href={`/chat/${ride.chat_group_id}`}
            className="bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-2 rounded-lg text-sm font-medium"
          >
            Open chat
          </Link>
        )}
        {ride.chat_group_id && myStatus === "pending" && (
          <span className="bg-surface-card text-mute px-4 py-2 rounded-lg text-sm">
            Chat unlocks once the captain approves you
          </span>
        )}
        {showLogLink && (
          <Link
            href={`/rides/${ride.id}/log`}
            className="bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-2 rounded-lg text-sm font-medium"
          >
            Log this ride
          </Link>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        {/* Non-captain join/leave */}
        {!isCaptain && ride.status === "planned" && (
          <>
            {myStatus === "pending" && (
              <div className="flex-1 bg-accent-gold/10 text-accent-gold text-center py-3 rounded-lg font-medium">
                Request pending
              </div>
            )}
            {myStatus === "approved" && (
              <>
                <div className="flex-1 bg-accent-green/10 text-accent-green text-center py-3 rounded-lg font-medium">
                  You&apos;re in!
                </div>
                <button
                  onClick={handleLeave}
                  disabled={busy}
                  className="bg-accent-red/20 text-accent-red hover:bg-accent-red/30 px-6 py-3 rounded-lg font-medium"
                >
                  Leave
                </button>
              </>
            )}
            {myStatus === "rejected" && (
              <div className="flex-1 bg-accent-red/20 text-accent-red text-center py-3 rounded-lg font-medium">
                Request declined
              </div>
            )}
            {(myStatus === null || myStatus === "left") && (
              <button
                onClick={handleJoin}
                disabled={busy}
                className="flex-1 bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 py-3 rounded-lg font-medium transition-colors"
              >
                {busy ? "Requesting…" : "Request to join"}
              </button>
            )}
          </>
        )}

        {/* Captain controls */}
        {isCaptain && (
          <>
            <button
              onClick={loadParticipants}
              className="flex-1 bg-surface-elevated hover:bg-surface-elevated text-ink py-3 rounded-lg font-medium"
            >
              Manage riders
            </button>
            {ride.status === "planned" && (
              <button
                onClick={handleStart}
                disabled={busy}
                className="bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 px-6 py-3 rounded-lg font-medium"
              >
                Start
              </button>
            )}
            {(ride.status === "planned" || ride.status === "in_progress") && (
              <button
                onClick={handleComplete}
                disabled={busy}
                className="bg-accent-green/80 hover:bg-accent-green disabled:opacity-50 text-ink px-6 py-3 rounded-lg font-medium"
              >
                Complete
              </button>
            )}
            {ride.status !== "cancelled" && ride.status !== "completed" && (
              <button
                onClick={handleCancel}
                disabled={busy}
                className="bg-accent-red/20 text-accent-red hover:bg-accent-red/30 px-6 py-3 rounded-lg font-medium"
              >
                Cancel
              </button>
            )}
          </>
        )}
      </div>

      {/* Participants */}
      {showParticipants && (
        <div className="bg-surface-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-ink">Rider Requests</h2>
            <button
              onClick={() => setShowParticipants(false)}
              className="text-mute hover:text-ink"
            >
              ✕
            </button>
          </div>
          {participants.length === 0 ? (
            <p className="text-mute text-sm">No join requests yet</p>
          ) : (
            <div className="space-y-3">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-surface-elevated/50 rounded-lg p-3">
                  <Link href={`/users/${p.user_id}`} className="flex items-center gap-3 hover:opacity-80">
                    <div className="w-8 h-8 rounded-full bg-ink text-canvas flex items-center justify-center text-sm font-bold">
                      {p.user?.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-ink text-sm font-medium">{p.user?.name || "Unknown"}</p>
                      <p className="text-mute text-xs capitalize">{p.status}</p>
                    </div>
                  </Link>
                  {p.status === "pending" && p.user_id !== ride.captain_id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "approved")}
                        className="bg-accent-green/90 hover:bg-accent-green text-ink px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "rejected")}
                        className="bg-accent-red/90 hover:bg-accent-red text-ink px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
