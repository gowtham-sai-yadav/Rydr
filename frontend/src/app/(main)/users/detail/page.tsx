"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { UserBadgeOut, UserOut } from "@/lib/api.types";
import { BadgeShelf } from "@/components/badges/BadgeShelf";
import { routes } from "@/lib/routes";

function UserProfilePageInner() {
  // Phase 4 W9: the record id arrives as a query parameter rather than a
  // path segment, so this route is one file that Next can statically
  // export for the Capacitor build. See lib/routes.ts for why.
  const id = useSearchParams().get("id") ?? "";
  const { user: me, refreshUser } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserOut | null>(null);
  // Public view shows earned badges only — no locked tiles. The catalog
  // endpoint is intentionally skipped here.
  const [badges, setBadges] = useState<UserBadgeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [verifying, setVerifying] = useState(false);
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
    api.listUserBadges(id).then(setBadges).catch(() => {});
  }, [load, id]);

  const handleFollow = async () => {
    if (!profile || isSelf) return;
    setBusy(true);
    setError("");
    const wasFollowed = profile.is_followed_by_me;
    const wasPending = profile.has_pending_follow_request;
    try {
      if (wasFollowed || wasPending) {
        // Unfollow, or cancel an outstanding request into a private account.
        await api.unfollowUser(profile.id);
        setProfile({
          ...profile,
          is_followed_by_me: false,
          has_pending_follow_request: false,
          followers_count: wasFollowed ? profile.followers_count - 1 : profile.followers_count,
        });
      } else if (profile.is_private) {
        // Lands as pending server-side - re-fetch rather than assume, so
        // the UI reflects the real state (can't optimistically know it
        // was accepted instantly for a private account).
        await api.followUser(profile.id);
        await load();
      } else {
        await api.followUser(profile.id);
        setProfile({
          ...profile,
          is_followed_by_me: true,
          followers_count: profile.followers_count + 1,
        });
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update follow");
    } finally {
      setBusy(false);
    }
  };

  const handleMessage = async () => {
    setMessaging(true);
    setError("");
    try {
      const thread = await api.openDMThread(id);
      router.push(`/chat/dm/${thread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open chat");
    } finally {
      setMessaging(false);
    }
  };

  const handleToggleVerified = async () => {
    if (!profile) return;
    setVerifying(true);
    setError("");
    try {
      const updated = await api.setVerifiedRider(profile.id, !profile.is_verified_rider);
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update verification");
    } finally {
      setVerifying(false);
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
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2 justify-center sm:justify-start">
            {profile.name}
            {profile.is_verified_rider && (
              <span title="Verified rider" className="text-accent-blue text-lg">✓</span>
            )}
          </h1>
          {me?.is_admin && !isSelf && (
            <button
              onClick={handleToggleVerified}
              disabled={verifying}
              className="text-[10px] font-bold uppercase tracking-wider text-accent-blue hover:underline mt-1 disabled:opacity-50"
            >
              {verifying ? "…" : profile.is_verified_rider ? "Revoke verified rider" : "Grant verified rider"}
            </button>
          )}
          {profile.home_city && (
            <p className="text-mute text-sm">{profile.home_city}</p>
          )}
          {profile.bio && <p className="text-body text-sm mt-2">{profile.bio}</p>}
          <div className="flex justify-center sm:justify-start gap-6 mt-3">
            <Link href={routes.userFollowers(profile.id)} className="text-sm hover:opacity-80">
              <span className="text-ink font-semibold">{profile.followers_count}</span>{" "}
              <span className="text-mute">followers</span>
            </Link>
            <Link href={routes.userFollowing(profile.id)} className="text-sm hover:opacity-80">
              <span className="text-ink font-semibold">{profile.following_count}</span>{" "}
              <span className="text-mute">following</span>
            </Link>
          </div>
        </div>
        {me && !isSelf && (
          <div className="flex flex-col items-stretch gap-2">
            <button
              onClick={handleFollow}
              disabled={busy}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                profile.is_followed_by_me || profile.has_pending_follow_request
                  ? "bg-surface-elevated text-ink hover:bg-surface-elevated"
                  : "bg-ink text-canvas hover:bg-surface-light"
              } disabled:opacity-50`}
            >
              {profile.is_followed_by_me
                ? "Following"
                : profile.has_pending_follow_request
                  ? "Requested"
                  : profile.is_private
                    ? "Request to follow"
                    : "Follow"}
            </button>
            {profile.is_followed_by_me ? (
              <button
                onClick={handleMessage}
                disabled={messaging}
                className="px-6 py-2 rounded-lg font-medium border border-hairline-strong text-ink hover:bg-surface-elevated transition-colors disabled:opacity-50"
              >
                {messaging ? "Opening…" : "Message"}
              </button>
            ) : profile.has_pending_follow_request ? (
              <p className="text-stone text-[11px] text-center max-w-[10rem]">
                Waiting for {profile.name.split(" ")[0]} to accept
              </p>
            ) : (
              <p className="text-stone text-[11px] text-center max-w-[10rem]">
                Follow to message
              </p>
            )}
          </div>
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

      {/* Badges — M8. Public view: earned-only, no locked tiles.
          Section is hidden entirely when the user has earned nothing
          so we don't show an empty card on a fresh account. */}
      {badges.length > 0 && (
        <div className="bg-surface-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-ink mb-3">Badges</h2>
          <BadgeShelf earned={badges} />
        </div>
      )}

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

/**
 * Suspense boundary around UserProfilePageInner.
 *
 * `useSearchParams` suspends during prerender, and the static export fails
 * with a missing-suspense-boundary error without this wrapper.
 */
export default function UserProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      }
    >
      <UserProfilePageInner />
    </Suspense>
  );
}
