"use client";
import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { UserOut } from "@/lib/api.types";


export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user: me, refreshUser } = useAuth();

  const [profile, setProfile] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSelf = me?.id === id;

  const load = useCallback(async () => {
    try {
      const u = await api.getUser(id);
      setProfile(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFollow = async () => {
    if (!profile || isSelf) return;
    setBusy(true);
    setError("");
    // Optimistic update — UI flips immediately.
    const wasFollowed = profile.is_followed_by_me;
    setProfile({
      ...profile,
      is_followed_by_me: !wasFollowed,
      followers_count: profile.followers_count + (wasFollowed ? -1 : 1),
    });
    try {
      if (wasFollowed) {
        await api.unfollowUser(profile.id);
      } else {
        await api.followUser(profile.id);
      }
      // Refresh viewer's following_count via /me
      await refreshUser();
    } catch (err) {
      // Rollback on error
      setProfile((p) =>
        p
          ? {
              ...p,
              is_followed_by_me: wasFollowed,
              followers_count: profile.followers_count,
            }
          : p,
      );
      setError(err instanceof Error ? err.message : "Failed to update follow");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
      </div>
    );
  }

  if (!profile) {
    return <div className="text-center py-12 text-mute">{error || "User not found"}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="bg-surface-card rounded-xl p-6 flex flex-col sm:flex-row gap-4 items-center sm:items-start">
        <div className="w-20 h-20 rounded-full bg-ink text-canvas flex items-center justify-center text-3xl font-bold">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            profile.name.charAt(0)
          )}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-bold text-ink">{profile.name}</h1>
          {profile.home_city && (
            <p className="text-mute text-sm">{profile.home_city}</p>
          )}
          {profile.bio && <p className="text-body text-sm mt-2">{profile.bio}</p>}
          <div className="flex justify-center sm:justify-start gap-6 mt-3">
            <Link href={`/users/${profile.id}/followers`} className="text-sm hover:opacity-80">
              <span className="text-ink font-semibold">{profile.followers_count}</span>{" "}
              <span className="text-mute">followers</span>
            </Link>
            <Link href={`/users/${profile.id}/following`} className="text-sm hover:opacity-80">
              <span className="text-ink font-semibold">{profile.following_count}</span>{" "}
              <span className="text-mute">following</span>
            </Link>
          </div>
        </div>
        {me && !isSelf && (
          <button
            onClick={handleFollow}
            disabled={busy}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              profile.is_followed_by_me
                ? "bg-surface-elevated text-ink hover:bg-surface-elevated"
                : "bg-ink text-canvas hover:bg-surface-light"
            } disabled:opacity-50`}
          >
            {profile.is_followed_by_me ? "Following" : "Follow"}
          </button>
        )}
        {isSelf && (
          <Link
            href="/profile"
            className="bg-surface-elevated hover:bg-surface-elevated text-ink px-6 py-2 rounded-lg font-medium"
          >
            Edit profile
          </Link>
        )}
      </div>

      {/* Bike */}
      {profile.bike && (profile.bike.name || profile.bike.model) && (
        <div className="bg-surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-3">Bike</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-mute uppercase">Name</p>
              <p className="text-ink font-medium">{profile.bike.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Model</p>
              <p className="text-ink font-medium">{profile.bike.model || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Engine</p>
              <p className="text-ink font-medium">
                {profile.bike.engine_cc ? `${profile.bike.engine_cc} cc` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Type</p>
              <p className="text-ink font-medium capitalize">{profile.bike.type}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
