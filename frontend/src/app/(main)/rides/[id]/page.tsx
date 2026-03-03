"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Ride, RideParticipant } from "@/lib/types";

const difficultyColors: Record<string, string> = {
  easy: "bg-green-600",
  moderate: "bg-yellow-600",
  hard: "bg-orange-600",
  expert: "bg-red-600",
};

export default function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [ride, setRide] = useState<Ride | null>(null);
  const [participants, setParticipants] = useState<RideParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);

  const isCaptain = user && ride && user.id === ride.captain_id;

  useEffect(() => {
    api.getRide(id).then((r) => {
      const data = r as Ride;
      setRide(data);
      // Check if current user has already requested to join
      const myParticipation = data.participants?.find((p) => p.user_id === user?.id);
      if (myParticipation) setJoinStatus(myParticipation.status);
    }).finally(() => setLoading(false));
  }, [id, user?.id]);

  const loadParticipants = async () => {
    try {
      const data = await api.getParticipants(id);
      setParticipants(data as RideParticipant[]);
      setShowParticipants(true);
    } catch {
    }
  };

  const handleJoin = async () => {
    setJoining(true);
    try {
      await api.joinRide(id);
      setJoinStatus("pending");
    } catch {
    } finally {
      setJoining(false);
    }
  };

  const handleParticipantAction = async (userId: string, status: string) => {
    try {
      await api.updateParticipant(id, userId, status);
      loadParticipants();
    } catch {
    }
  };

  const handleCancel = async () => {
    try {
      await api.deleteRide(id);
      router.push("/rides");
    } catch {
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
      </div>
    );
  }

  if (!ride) {
    return <div className="text-center py-12 text-gray-400">Ride not found</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Hero */}
      <div className="relative rounded-xl overflow-hidden h-64 bg-gray-800">
        {ride.thumbnail_url ? (
          <img src={ride.thumbnail_url} alt={ride.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-500">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`${difficultyColors[ride.difficulty_level] || "bg-gray-600"} text-white text-xs px-2 py-1 rounded-full font-medium capitalize`}>
              {ride.difficulty_level}
            </span>
            <span className="bg-gray-700 text-white text-xs px-2 py-1 rounded-full font-medium capitalize">
              {ride.status}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">{ride.title}</h1>
        </div>
      </div>

      {/* Captain Card */}
      {ride.captain && (
        <div className="bg-gray-800 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-lg font-bold text-white">
            {ride.captain.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm text-gray-400">Captain</p>
            <p className="text-white font-semibold">{ride.captain.name}</p>
          </div>
        </div>
      )}

      {/* Details */}
      <div className="bg-gray-800 rounded-xl p-6">
        {ride.description && (
          <p className="text-gray-300 mb-4">{ride.description}</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-400 uppercase">Date</p>
            <p className="text-white font-medium">{ride.ride_date}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Time</p>
            <p className="text-white font-medium">{ride.start_time}{ride.estimated_end_time ? ` - ${ride.estimated_end_time}` : ""}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Bike Type</p>
            <p className="text-white font-medium">{ride.recommended_bike_type || "Any"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase">Riders</p>
            <p className="text-white font-medium">{ride.participant_count ?? 0} / {ride.max_riders}</p>
          </div>
        </div>
        {ride.break_schedule && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-xs text-gray-400 uppercase mb-1">Break Schedule</p>
            <p className="text-gray-300 text-sm">{ride.break_schedule}</p>
          </div>
        )}
      </div>

      {/* Stops */}
      {ride.stops && ride.stops.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Route Stops</h2>
          <div className="space-y-4">
            {ride.stops.map((stop, i) => (
              <div key={stop.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    stop.is_break_stop ? "bg-yellow-600 text-white" : "bg-orange-600 text-white"
                  }`}>
                    {i + 1}
                  </div>
                  {i < ride.stops!.length - 1 && <div className="w-0.5 flex-1 bg-gray-700 my-1" />}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{stop.name}</h3>
                    {stop.is_break_stop && (
                      <span className="text-yellow-500 text-xs bg-yellow-500/10 px-2 py-0.5 rounded-full">Break</span>
                    )}
                  </div>
                  {stop.description && <p className="text-gray-400 text-sm mt-0.5">{stop.description}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {!isCaptain && ride.status === "open" && (
          <>
            {joinStatus === "pending" ? (
              <div className="flex-1 bg-yellow-600/20 text-yellow-500 text-center py-3 rounded-lg font-medium">
                Request Pending
              </div>
            ) : joinStatus === "approved" ? (
              <div className="flex-1 bg-green-600/20 text-green-500 text-center py-3 rounded-lg font-medium">
                You&apos;re In!
              </div>
            ) : joinStatus === "rejected" ? (
              <div className="flex-1 bg-red-600/20 text-red-400 text-center py-3 rounded-lg font-medium">
                Request Declined
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition-colors"
              >
                {joining ? "Requesting..." : "Request to Join"}
              </button>
            )}
          </>
        )}

        {isCaptain && (
          <>
            <button
              onClick={loadParticipants}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Manage Riders
            </button>
            <button
              onClick={handleCancel}
              className="bg-red-600/20 text-red-400 hover:bg-red-600/30 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Cancel Ride
            </button>
          </>
        )}
      </div>

      {/* Participants Modal */}
      {showParticipants && (
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Rider Requests</h2>
            <button onClick={() => setShowParticipants(false)} className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {participants.length === 0 ? (
            <p className="text-gray-400 text-sm">No join requests yet</p>
          ) : (
            <div className="space-y-3">
              {participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-sm font-bold text-white">
                      {p.user?.name?.charAt(0) || "?"}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">{p.user?.name || "Unknown"}</p>
                      <p className="text-gray-400 text-xs capitalize">{p.status}</p>
                    </div>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "approved")}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleParticipantAction(p.user_id, "rejected")}
                        className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
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
