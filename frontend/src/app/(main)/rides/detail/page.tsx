"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type {
  ParticipantStatus,
  RidePlanOut,
  RidePlanParticipantOut,
} from "@/lib/api.types";
import { RideChatPanel } from "@/components/rides/RideChatPanel";
import { LiveRideMap } from "@/components/rides/LiveRideMap";
import { ElevationProfileChart } from "@/components/rides/ElevationProfileChart";
import { routes } from "@/lib/routes";


function RideDetailPageInner() {
  // Phase 4 W9: the record id arrives as a query parameter rather than a
  // path segment, so this route is one file that Next can statically
  // export for the Capacitor build. See lib/routes.ts for why.
  const id = useSearchParams().get("id") ?? "";
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
      router.push(routes.rides);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
      setBusy(false);
    }
  };

  const handleParticipantAction = async (
    userId: string,
    status: "approved" | "rejected" | "waitlisted",
  ) => {
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
    <div className="max-w-5xl mx-auto space-y-6 pb-16 relative">
      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg">
          {error}
        </div>
      )}

      {/* Hero Header Banner */}
      <div className="relative rounded-2xl overflow-hidden h-64 border border-hairline-strong shadow-lg select-none">
        {ride.thumbnail_url || ride.destination?.hero_media_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ride.thumbnail_url || ride.destination?.hero_media_url || ""}
            alt={ride.title}
            className="w-full h-full object-cover brightness-[0.6] filter saturate-[0.9]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-surface-card text-stone">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2}
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="bg-surface-deep/80 border border-hairline-strong text-ink text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider select-none">
              {ride.difficulty_level}
            </span>
            <span className={`border ${
              ride.status === "in_progress"
                ? "border-accent-red bg-accent-red/10 text-accent-red animate-pulse font-extrabold tracking-widest"
                : ride.status === "planned"
                  ? "border-accent-gold/40 bg-accent-gold/10 text-accent-gold font-bold tracking-wider"
                  : ride.status === "completed"
                    ? "border-accent-green/40 bg-accent-green/10 text-accent-green font-bold tracking-wider"
                    : "border-accent-red/40 bg-accent-red/10 text-accent-red font-bold tracking-wider"
            } text-[9px] px-2.5 py-1 rounded-full uppercase select-none`}>
              {ride.status === "in_progress" ? "LIVE SIGNAL" : ride.status.replace("_", " ")}
            </span>
            <span className="bg-surface-deep/80 border border-hairline-strong text-ink text-[9px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider select-none">
              {ride.visibility}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">{ride.title}</h1>
        </div>
      </div>

      {ride.status === "in_progress" ? (
        /* ==================== ACTIVE RIDE COCKPIT LAYOUT ==================== */
        <div className="space-y-6">
          {/* Captain Control Hud strip inside live ride */}
          {isCaptain && (
            <div className="card-bordered p-4 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg flex flex-wrap items-center justify-between gap-4">
              <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
              <div className="space-y-0.5">
                <h4 className="text-[10px] text-mute font-bold uppercase tracking-widest select-none">Telemetry Command Deck</h4>
                <p className="text-xs text-ink font-semibold">You are directing this active telemetry session</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadParticipants}
                  className="bg-surface-deep hover:bg-surface-elevated text-ink px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-hairline-strong transition-all duration-200"
                >
                  Manage Roster
                </button>
                <button
                  onClick={handleComplete}
                  disabled={busy}
                  className="bg-accent-green text-canvas hover:bg-accent-green/90 disabled:opacity-50 px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-[0_4px_12px_rgba(34,197,94,0.15)]"
                >
                  Complete Ride
                </button>
                <button
                  onClick={handleCancel}
                  disabled={busy}
                  className="bg-accent-red/20 text-accent-red hover:bg-accent-red/30 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Interactive Split Pane Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
            {/* Map Telemetry Card */}
            <div className="lg:col-span-3 card-bordered bg-surface-card/30 backdrop-blur-md rounded-2xl overflow-hidden shadow-lg p-5">
              {ride.destination && (
                <LiveRideMap rideId={ride.id} destination={ride.destination} routeId={ride.route_id} />
              )}
            </div>

            {ride.route_id && (
              <div className="lg:col-span-3">
                <ElevationProfileChart routeId={ride.route_id} />
              </div>
            )}

            {/* Squadron Communications Card */}
            <div className="lg:col-span-2 card-bordered bg-surface-card/30 backdrop-blur-md rounded-2xl shadow-lg p-5 flex flex-col h-[560px]">
              <h3 className="text-xs font-bold text-accent-blue tracking-widest uppercase mb-4 select-none flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent-blue animate-ping" />
                Crew Comms
              </h3>
              <div className="flex-1 overflow-hidden relative rounded-xl border border-hairline bg-surface-deep/45">
                {ride.chat_group_id && (isCaptain || myStatus === "approved") ? (
                  <RideChatPanel groupId={ride.chat_group_id} readOnly={false} />
                ) : (
                  <div className="h-full flex items-center justify-center p-6 text-center text-stone text-xs uppercase font-semibold tracking-wider">
                    Communications locked
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== PRE-RIDE / COMPLETED LAYOUT ==================== */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

          {/* Left Column: Details & Roster Info */}
          <div className="lg:col-span-2 space-y-6">

            {/* Core Details grid */}
            <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-5">
              <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
              {ride.description && (
                <p className="text-sm leading-relaxed text-body">{ride.description}</p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider select-none">Planned Date</p>
                  <p className="text-ink font-bold text-xs uppercase mt-1">{ride.planned_date}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider select-none">Start Time</p>
                  <p className="text-ink font-bold text-xs uppercase mt-1">
                    {ride.planned_start_time.slice(0, 5)}
                    {ride.estimated_end_time ? ` – ${ride.estimated_end_time.slice(0, 5)}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider select-none">Machine Specs</p>
                  <p className="text-ink font-bold text-xs mt-1">{ride.recommended_bike_type || "Any Type"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider select-none">Crew Roster</p>
                  <p className="text-ink font-bold text-xs mt-1">
                    {ride.max_riders === null ? (
                      <>
                        {ride.participant_count} <span className="text-mute font-normal text-[9px] uppercase">/ No Cap</span>
                      </>
                    ) : (
                      `${ride.participant_count} / ${ride.max_riders}`
                    )}
                  </p>
                  {/* Phase 4 W6: max_riders is now enforced, so the number has
                      consequences and the state worth surfacing is whether
                      there is room. seats_available comes from the API,
                      which knows the captain occupies one of the seats. */}
                  {ride.max_riders !== null && (
                    ride.seats_available > 0 ? (
                      <p className="text-[9px] text-accent-green font-semibold uppercase tracking-wider mt-1">
                        {ride.seats_available} seat{ride.seats_available === 1 ? "" : "s"} left
                      </p>
                    ) : (
                      <p className="text-[9px] text-accent-orange font-semibold uppercase tracking-wider mt-1">
                        Full{ride.waitlist_count > 0 && ` · ${ride.waitlist_count} waiting`}
                      </p>
                    )
                  )}
                </div>
              </div>

              {ride.break_schedule && (
                <div className="pt-4 border-t border-hairline-strong">
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider select-none mb-1">Break Logistics</p>
                  <p className="text-body text-xs leading-relaxed">{ride.break_schedule}</p>
                </div>
              )}
            </div>

            {/* Communications Block if approved */}
            {ride.chat_group_id && (isCaptain || myStatus === "approved") && (
              <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg h-[400px] flex flex-col">
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
                <h3 className="text-xs font-bold text-accent-blue tracking-widest uppercase mb-4 select-none">Squadron Chat</h3>
                <div className="flex-1 overflow-hidden relative rounded-xl border border-hairline bg-surface-deep/45">
                  <RideChatPanel groupId={ride.chat_group_id} readOnly={ride.status === "cancelled"} />
                </div>
              </div>
            )}
          </div>

          {/* Right Column: HUD Controller, Destination & Captain Details */}
          <div className="lg:col-span-1 space-y-6">

            {/* HUD Command Console Card */}
            <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg space-y-4">
              <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-orange/20 to-transparent" />
              <h3 className="text-xs font-bold text-accent-orange tracking-widest uppercase select-none">Console Deck</h3>

              <div className="space-y-3 pt-2">
                {/* Non-captain triggers */}
                {!isCaptain && ride.status === "planned" && (
                  <div className="space-y-2">
                    {myStatus === "pending" && (
                      <div className="w-full bg-accent-gold/10 text-accent-gold border border-accent-gold/20 text-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider">
                        Join Request Pending
                      </div>
                    )}
                    {myStatus === "approved" && (
                      <div className="space-y-2">
                        <div className="w-full bg-accent-green/10 text-accent-green border border-accent-green/20 text-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider">
                          You are approved
                        </div>
                        <button
                          onClick={handleLeave}
                          disabled={busy}
                          className="w-full bg-accent-red/20 text-accent-red hover:bg-accent-red/30 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200"
                        >
                          Leave Ride
                        </button>
                      </div>
                    )}
                    {myStatus === "waitlisted" && (
                      <div className="w-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 text-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider space-y-1">
                        <span className="block">On the Waitlist</span>
                        <span className="block text-[9px] font-normal normal-case opacity-80">
                          Added automatically when a seat frees up
                        </span>
                      </div>
                    )}
                    {myStatus === "rejected" && (
                      <div className="w-full bg-accent-red/20 text-accent-red border border-accent-red/30 text-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider">
                        Request Declined
                      </div>
                    )}
                    {(myStatus === null || myStatus === "left") && (
                      <button
                        onClick={handleJoin}
                        disabled={busy}
                        className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-[0_4px_12px_rgba(212,175,55,0.15)]"
                      >
                        {busy
                          ? "Requesting…"
                          : ride.seats_available > 0
                            ? ride.requires_approval ? "Request to Join" : "Join Crew"
                            // Joining a full ride is still allowed — the
                            // captain can waitlist you — but the label
                            // should not imply a seat.
                            : "Join Waitlist"}
                      </button>
                    )}
                  </div>
                )}

                {/* Captain controls */}
                {isCaptain && (
                  <div className="space-y-2.5">
                    <button
                      onClick={loadParticipants}
                      className="w-full bg-surface-deep hover:bg-surface-elevated text-ink py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-hairline-strong transition-all duration-200"
                    >
                      Manage Roster
                    </button>
                    {ride.status === "planned" && (
                      <button
                        onClick={handleStart}
                        disabled={busy}
                        className="w-full bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-[0_4px_12px_rgba(212,175,55,0.15)]"
                      >
                        Start Session
                      </button>
                    )}
                    {showLogLink && (
                      <Link
                        href={routes.rideLog(ride.id)}
                        className="block w-full bg-accent-blue text-canvas hover:bg-accent-blue/90 text-center py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-[0_4px_12px_rgba(6,182,212,0.15)]"
                      >
                        Log Ride Stats
                      </Link>
                    )}
                    {ride.status !== "cancelled" && ride.status !== "completed" && (
                      <button
                        onClick={handleCancel}
                        disabled={busy}
                        className="w-full bg-accent-red/20 text-accent-red hover:bg-accent-red/30 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200"
                      >
                        Cancel Ride
                      </button>
                    )}
                  </div>
                )}

                {/* Chat status for pending guests */}
                {ride.chat_group_id && myStatus === "pending" && (
                  <p className="text-[10px] text-stone text-center uppercase tracking-wider font-semibold pt-1">
                    Crew comms unlock after approval
                  </p>
                )}
              </div>
            </div>

            {/* Quick Destination link Card */}
            {ride.destination && (
              <Link
                href={routes.destination(ride.destination.id)}
                className="block card-bordered p-5 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg hover:border-accent-gold/45 transition-all duration-300"
              >
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
                <p className="text-[9px] text-mute uppercase font-bold tracking-widest mb-1 select-none">Destination Target</p>
                <h4 className="text-ink font-bold text-sm uppercase tracking-wide">{ride.destination.name}</h4>
                {ride.destination.region && (
                  <p className="text-mute text-xs mt-0.5">{ride.destination.region}</p>
                )}
              </Link>
            )}

            {/* Quick Captain Profile link Card */}
            {ride.captain && (
              <Link
                href={routes.user(ride.captain.id)}
                className="block card-bordered p-4 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg hover:border-accent-blue/45 transition-all duration-300 flex items-center gap-4"
              >
                <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
                <div className="w-10 h-10 rounded-full bg-surface-deep border border-hairline flex items-center justify-center text-sm font-bold font-display text-ink uppercase">
                  {ride.captain.name.charAt(0)}
                </div>
                <div className="space-y-0.5">
                  <p className="text-[9px] text-mute uppercase font-bold tracking-widest select-none">Riding Captain</p>
                  <h4 className="text-ink font-bold text-xs uppercase tracking-wide">{ride.captain.name}</h4>
                </div>
              </Link>
            )}

          </div>
        </div>
      )}

      {/* Roster Requests overlay list */}
      {showParticipants && (
        <div className="card-bordered p-6 bg-surface-card/90 backdrop-blur-md rounded-2xl shadow-2xl relative space-y-4 max-w-xl mx-auto border border-hairline-strong">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-ink uppercase tracking-widest select-none">Roster Requests</h3>
            <button
              onClick={() => setShowParticipants(false)}
              className="text-mute hover:text-ink font-bold text-sm transition-colors duration-200"
            >
              ✕
            </button>
          </div>
          {participants.length === 0 ? (
            <p className="text-mute text-xs uppercase tracking-wider font-semibold py-4 text-center">No telemetry requests yet</p>
          ) : (
            <div className="space-y-3">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-surface-deep/60 rounded-xl p-3 border border-hairline-strong">
                  <Link href={routes.user(p.user_id)} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs font-bold font-display text-ink uppercase">
                      {p.user?.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-ink text-xs font-bold uppercase tracking-wider">{p.user?.name || "Unknown"}</p>
                      <p className="text-mute text-[9px] uppercase tracking-wider mt-0.5">{p.status}</p>
                    </div>
                  </Link>
                  {p.status === "pending" && p.user_id !== ride.captain_id && (
                    <div className="flex gap-2">
                      {/* Approving into a full ride is a 409 from the API,
                          so the button that would fail is replaced rather
                          than shown and left to error. */}
                      {ride.seats_available > 0 ? (
                        <button
                          onClick={() => handleParticipantAction(p.user_id, "approved")}
                          className="bg-accent-green text-canvas hover:bg-accent-green/90 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200"
                        >
                          Approve
                        </button>
                      ) : (
                        <button
                          onClick={() => handleParticipantAction(p.user_id, "waitlisted")}
                          className="bg-accent-blue text-canvas hover:bg-accent-blue/90 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200"
                          title="The ride is full. This rider joins the queue and is approved automatically when a seat frees."
                        >
                          Waitlist
                        </button>
                      )}
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "rejected")}
                        className="bg-accent-red/20 text-accent-red hover:bg-accent-red/30 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {p.status === "waitlisted" && p.user_id !== ride.captain_id && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-accent-blue uppercase tracking-wider font-semibold">in queue</span>
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "rejected")}
                        className="bg-accent-red/20 text-accent-red hover:bg-accent-red/30 px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-200"
                      >
                        Remove
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


/**
 * Suspense boundary around RideDetailPageInner.
 *
 * `useSearchParams` suspends during prerender, and the static export fails
 * with a missing-suspense-boundary error without this wrapper.
 */
export default function RideDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      }
    >
      <RideDetailPageInner />
    </Suspense>
  );
}
