"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { BadgeOut, BikeType, FollowEdgeOut, PersonalStatsOut, UserBadgeOut } from "@/lib/api.types";
import { BadgeShelf } from "@/components/badges/BadgeShelf";
import { PersonalRecordsPanel } from "@/components/profile/PersonalRecordsPanel";
import { BestEffortsPanel } from "@/components/profile/BestEffortsPanel";
import { routes } from "@/lib/routes";
import Avatar from "@/components/ui/Avatar";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  // Phase 4 W5: widened from three ride counters to weekly/monthly
  // distance, streaks and personal bests; the original three fields kept
  // their names. See lib/api.ts getMyStats().
  const [stats, setStats] = useState<PersonalStatsOut | null>(null);
  // Earned awards + the full catalog so the shelf can render locked tiles.
  // Loaded in parallel — neither blocks first paint of the rest of the page.
  const [badges, setBadges] = useState<UserBadgeOut[]>([]);
  const [badgeCatalog, setBadgeCatalog] = useState<BadgeOut[]>([]);
  const [editing, setEditing] = useState(false);
  const [editBike, setEditBike] = useState(false);

  // Profile form state (now includes home location — needed by M2 cost calc)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyRadius, setPrivacyRadius] = useState("");
  const [followRequests, setFollowRequests] = useState<FollowEdgeOut[]>([]);

  // Bike form state (now includes mileage_kmpl + engine_cc + type — feed cost calc)
  const [bikeName, setBikeName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");
  const [bikeEngineCc, setBikeEngineCc] = useState("");
  const [bikeMileage, setBikeMileage] = useState("");
  const [bikeType, setBikeType] = useState<BikeType>("any");
  const [bikeServiceInterval, setBikeServiceInterval] = useState("");
  const [markingServiced, setMarkingServiced] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyStats().then(setStats).catch(() => {});
    api.listMyBadges().then(setBadges).catch(() => {});
    api.listBadgeCatalog().then(setBadgeCatalog).catch(() => {});
    api.listFollowRequests().then((res) => setFollowRequests(res.edges)).catch(() => {});
  }, []);

  const handleFollowRequest = async (followerId: string, action: "accept" | "reject") => {
    setFollowRequests((prev) => prev.filter((e) => e.user.id !== followerId));
    try {
      if (action === "accept") await api.acceptFollowRequest(followerId);
      else await api.rejectFollowRequest(followerId);
    } catch {
      // Best-effort — a failed accept/reject just leaves the request for
      // a retry; re-fetching would flicker it back in, not worth it here.
    }
  };

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || "");
      setBio(user.bio || "");
      setHomeCity(user.home_city || "");
      setHomeLat(user.home_latitude?.toString() || "");
      setHomeLng(user.home_longitude?.toString() || "");
      setIsPrivate(user.is_private);
      setPrivacyRadius(user.privacy_zone_radius_km != null ? String(user.privacy_zone_radius_km) : "");
      setBikeName(user.bike?.name || "");
      setBikeModel(user.bike?.model || "");
      setBikeYear(user.bike?.year?.toString() || "");
      setBikeEngineCc(user.bike?.engine_cc?.toString() || "");
      setBikeMileage(user.bike?.mileage_kmpl?.toString() || "");
      setBikeType((user.bike?.type as BikeType) || "any");
      setBikeServiceInterval(user.bike?.service_interval_km?.toString() || "3000");
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setError("");
    try {
      // Backend wants both lat+lng or neither — validate client-side.
      const latStr = homeLat.trim();
      const lngStr = homeLng.trim();
      if ((latStr === "") !== (lngStr === "")) {
        throw new Error("Home location needs both latitude and longitude — or neither.");
      }
      const lat = latStr ? parseFloat(latStr) : null;
      const lng = lngStr ? parseFloat(lngStr) : null;
      if (lat != null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
        throw new Error("Latitude must be between -90 and 90.");
      }
      if (lng != null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
        throw new Error("Longitude must be between -180 and 180.");
      }
      await api.updateMe({
        name,
        phone: phone || null,
        bio: bio || null,
        home_city: homeCity || null,
        home_latitude: lat,
        home_longitude: lng,
        is_private: isPrivate,
        privacy_zone_radius_km: privacyRadius === "" ? null : parseFloat(privacyRadius),
      });
      await refreshUser();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBike = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateBike({
        name: bikeName || null,
        model: bikeModel || null,
        year: bikeYear ? parseInt(bikeYear) : null,
        engine_cc: bikeEngineCc ? parseInt(bikeEngineCc) : null,
        mileage_kmpl: bikeMileage ? parseFloat(bikeMileage) : null,
        type: bikeType,
        service_interval_km: bikeServiceInterval ? parseInt(bikeServiceInterval) : undefined,
      });
      await refreshUser();
      setEditBike(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bike");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkServiced = async () => {
    setMarkingServiced(true);
    setError("");
    try {
      await api.markBikeServiced();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark serviced");
    } finally {
      setMarkingServiced(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16 relative">
      {/* 1. Header Hero Banner */}
      <div className="h-44 sm:h-56 rounded-2xl overflow-hidden relative border border-hairline-strong shadow-lg select-none">
        <div 
          className="absolute inset-0 bg-cover bg-center brightness-[0.6] filter saturate-[0.8]"
          style={{ backgroundImage: "url('/images/scenic_ride.jpg')" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 flex flex-col sm:flex-row items-center sm:items-end gap-4 z-10">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-accent-gold via-accent-orange to-accent-blue p-[3px] shadow-xl">
            <Avatar
              name={user.name}
              avatarUrl={user.avatar_url}
              size="full"
            />
          </div>
          <div className="text-center sm:text-left flex-1 space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink uppercase">{user.name}</h1>
            <p className="text-xs text-mute font-semibold tracking-wider uppercase">{user.email}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider shadow-lg">
          {error}
        </div>
      )}

      <AnniversaryBanner createdAt={user.created_at} />

      {followRequests.length > 0 && (
        <div className="card-bordered p-5 bg-surface-card/30 backdrop-blur-md rounded-2xl space-y-3">
          <h3 className="text-xs font-bold text-accent-gold tracking-widest uppercase">
            Follow Requests
          </h3>
          <div className="space-y-2">
            {followRequests.map((edge) => (
              <div key={edge.user.id} className="flex items-center gap-3">
                <Avatar
                  name={edge.user.name}
                  avatarUrl={edge.user.avatar_url}
                  size="md"
                />
                <p className="flex-1 text-sm text-ink font-medium truncate">{edge.user.name}</p>
                <button
                  onClick={() => handleFollowRequest(edge.user.id, "accept")}
                  className="bg-accent-gold text-canvas hover:bg-accent-gold/90 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleFollowRequest(edge.user.id, "reject")}
                  className="bg-surface-elevated text-mute hover:text-ink px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Decline
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Dual-Column Grid Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column - Stats & Gamification Badges */}
        <div className="space-y-6 md:col-span-1">
          {/* Stats count */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-xs font-bold text-accent-gold tracking-widest uppercase select-none">Ride stats</h3>
              <Link href={routes.leaderboard} className="text-[10px] font-bold uppercase tracking-widest text-accent-gold hover:underline">
                Leaderboard →
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-ink">{stats?.rides_captained ?? 0}</p>
                <p className="text-[9px] text-mute uppercase font-semibold tracking-wider mt-1 select-none">Lead</p>
              </div>
              <div className="text-center border-x border-hairline">
                <p className="text-2xl font-bold font-display text-ink">{stats?.rides_joined ?? 0}</p>
                <p className="text-[9px] text-mute uppercase font-semibold tracking-wider mt-1 select-none">Joined</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-display text-ink">{stats?.rides_completed ?? 0}</p>
                <p className="text-[9px] text-mute uppercase font-semibold tracking-wider mt-1 select-none">Done</p>
              </div>
            </div>

            {/* Distance is derived from home -> destination -> home, not
                measured, so with no home location every figure below is
                zero. Prompting is the only honest thing to show in that
                case — a dashboard of zeros reads as "you have ridden
                nothing". */}
            {stats && !stats.has_home_location ? (
              <p className="text-[11px] text-accent-orange mt-4 pt-4 border-t border-hairline border-dashed leading-relaxed">
                Set your home location below to see distance ridden, streaks and personal bests.
              </p>
            ) : (
              stats && (
                <>
                  <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-hairline border-dashed">
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">This week</p>
                      <p className="text-ink font-bold text-sm mt-0.5">{stats.distance_this_week_km} km</p>
                      <p className="text-[9px] text-stone mt-0.5">{stats.rides_this_week} ride{stats.rides_this_week === 1 ? "" : "s"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">This month</p>
                      <p className="text-ink font-bold text-sm mt-0.5">{stats.distance_this_month_km} km</p>
                      <p className="text-[9px] text-stone mt-0.5">{stats.rides_this_month} ride{stats.rides_this_month === 1 ? "" : "s"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">All time</p>
                      <p className="text-ink font-bold text-sm mt-0.5">{stats.total_distance_km} km</p>
                      <p className="text-[9px] text-stone mt-0.5">{stats.destinations_visited} spot{stats.destinations_visited === 1 ? "" : "s"}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">Longest</p>
                      <p className="text-ink font-bold text-sm mt-0.5">{stats.longest_ride_km} km</p>
                      <p className="text-[9px] text-stone mt-0.5">personal best</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-hairline border-dashed">
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">Current streak</p>
                      <p className="text-accent-orange font-bold text-sm mt-0.5">
                        {stats.current_streak_weeks} week{stats.current_streak_weeks === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-mute uppercase font-semibold tracking-wider select-none">Best streak</p>
                      <p className="text-ink font-bold text-sm mt-0.5">
                        {stats.longest_streak_weeks} week{stats.longest_streak_weeks === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                </>
              )
            )}
          </div>

          {/* Social followers */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
            <h3 className="text-xs font-bold text-accent-blue tracking-widest uppercase mb-4 select-none">Social</h3>
            <div className="flex justify-around text-xs font-semibold uppercase tracking-wider">
              <a
                href={routes.userFollowers(user.id)}
                className="text-mute hover:text-accent-gold transition-colors duration-200"
              >
                <span className="text-ink font-bold font-display mr-1">{user.followers_count}</span> followers
              </a>
              <div className="w-[1px] bg-hairline h-4" />
              <a
                href={routes.userFollowing(user.id)}
                className="text-mute hover:text-accent-gold transition-colors duration-200"
              >
                <span className="text-ink font-bold font-display mr-1">{user.following_count}</span> following
              </a>
            </div>
          </div>

        </div>

        {/* Right Column - Profile Info & Biker Garage */}
        <div className="space-y-6 md:col-span-2">
          {/* Profile details */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider select-none">Profile Info</h3>
              <button
                onClick={() => setEditing(!editing)}
                className="text-xs font-bold uppercase tracking-widest text-accent-gold hover:underline transition-colors duration-200"
              >
                {editing ? "Cancel" : "Edit Profile"}
              </button>
            </div>

            {!editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Phone</p>
                    <p className="text-ink font-semibold text-sm mt-0.5">{user.phone || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Home Base</p>
                    <p className="text-ink font-semibold text-sm mt-0.5">{user.home_city || "—"}</p>
                  </div>
                </div>
                {user.bio && (
                  <div className="pt-3 border-t border-hairline border-dashed">
                    <p className="text-[10px] text-mute uppercase font-semibold tracking-wider mb-1">Rider Bio</p>
                    <p className="text-body font-medium text-sm leading-relaxed">{user.bio}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 mt-4 border-t border-hairline-strong pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Name</label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Phone</label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={3}
                    className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                  />
                </div>

                <div className="border-t border-hairline border-dashed pt-4">
                  <p className="text-[10px] text-accent-gold font-bold uppercase tracking-widest mb-3">
                    Home Location (powers distance sorting)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">City</label>
                      <input
                        value={homeCity}
                        onChange={(e) => setHomeCity(e.target.value)}
                        className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                        placeholder="e.g. Bangalore"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Latitude</label>
                      <input
                        value={homeLat}
                        onChange={(e) => setHomeLat(e.target.value)}
                        placeholder="12.97"
                        className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Longitude</label>
                      <input
                        value={homeLng}
                        onChange={(e) => setHomeLng(e.target.value)}
                        placeholder="77.59"
                        className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-hairline border-dashed pt-4 space-y-4">
                  <p className="text-[10px] text-accent-gold font-bold uppercase tracking-widest">
                    Settings — Privacy &amp; Safety
                  </p>
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isPrivate}
                      onChange={(e) => setIsPrivate(e.target.checked)}
                      className="mt-0.5 rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30"
                    />
                    <span>
                      <span className="block text-sm text-ink font-medium">Private account</span>
                      <span className="block text-xs text-mute mt-0.5">
                        New followers need your approval before they follow you (and before they can message you).
                      </span>
                    </span>
                  </label>

                  <div>
                    <label className="flex items-start gap-3 cursor-pointer select-none mb-2">
                      <input
                        type="checkbox"
                        checked={privacyRadius !== ""}
                        onChange={(e) => setPrivacyRadius(e.target.checked ? "3" : "")}
                        className="mt-0.5 rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30"
                      />
                      <span>
                        <span className="block text-sm text-ink font-medium">Privacy zone around home</span>
                        <span className="block text-xs text-mute mt-0.5">
                          Blurs the start/end of your rides on any public map or heatmap within this radius of your
                          home location, so no one can pinpoint exactly where you live.
                        </span>
                      </span>
                    </label>
                    {privacyRadius !== "" && (
                      <div className="flex items-center gap-2 pl-7">
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={privacyRadius}
                          onChange={(e) => setPrivacyRadius(e.target.value)}
                          className="w-24 bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-3 py-1.5 text-ink text-sm focus:outline-none"
                        />
                        <span className="text-xs text-mute">km radius</span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="btn btn-primary h-9 px-6 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200"
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
            )}
          </div>

          {/* Bike card */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-blue/20 to-transparent" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-ink uppercase tracking-wider select-none">The Biker Garage</h3>
              <button
                onClick={() => setEditBike(!editBike)}
                className="text-xs font-bold uppercase tracking-widest text-accent-gold hover:underline transition-colors duration-200"
              >
                {editBike ? "Cancel" : "Edit Machine"}
              </button>
            </div>

            {!editBike ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Name</p>
                  <p className="text-ink font-semibold text-sm mt-0.5">{user.bike?.name || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Model</p>
                  <p className="text-ink font-semibold text-sm mt-0.5">{user.bike?.model || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Year</p>
                  <p className="text-ink font-semibold text-sm mt-0.5">{user.bike?.year || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Engine Capacity</p>
                  <p className="text-ink font-semibold text-sm mt-0.5">
                    {user.bike?.engine_cc ? `${user.bike.engine_cc} cc` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Fuel Mileage</p>
                  <p className="text-ink font-semibold text-sm mt-0.5">
                    {user.bike?.mileage_kmpl ? `${user.bike.mileage_kmpl} kmpl` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Machine Type</p>
                  <p className="text-ink font-semibold text-sm mt-0.5 capitalize">{user.bike?.type ?? "any"}</p>
                </div>
              </div>
            ) : null}

            {user.bike && !editBike && (
              <div className="mt-5 pt-4 border-t border-hairline-strong space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-mute uppercase font-semibold tracking-wider">Gear Tracking</p>
                  <button
                    onClick={handleMarkServiced}
                    disabled={markingServiced}
                    className="text-xs font-bold uppercase tracking-widest text-accent-gold hover:underline disabled:opacity-50"
                  >
                    {markingServiced ? "Saving…" : "Mark serviced"}
                  </button>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink font-semibold">
                    {user.bike.total_km_since_service.toFixed(0)} / {user.bike.service_interval_km} km since service
                  </span>
                  {user.bike.total_km_since_service >= user.bike.service_interval_km && (
                    <span className="text-accent-red text-xs font-bold uppercase">Due for service</span>
                  )}
                </div>
                <div className="w-full h-1.5 bg-surface-deep rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      user.bike.total_km_since_service >= user.bike.service_interval_km
                        ? "bg-accent-red"
                        : "bg-accent-gold"
                    }`}
                    style={{
                      width: `${Math.min(100, (user.bike.total_km_since_service / user.bike.service_interval_km) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-mute">
                  {user.bike.total_km_lifetime.toFixed(0)} km lifetime
                  {user.bike.last_serviced_at && ` · last serviced ${new Date(user.bike.last_serviced_at).toLocaleDateString()}`}
                </p>
              </div>
            )}

            {editBike && (
              <div className="space-y-4 mt-4 border-t border-hairline-strong pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Bike Name</label>
                    <input
                      value={bikeName}
                      onChange={(e) => setBikeName(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                      placeholder="e.g. Shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Model</label>
                    <input
                      value={bikeModel}
                      onChange={(e) => setBikeModel(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                      placeholder="e.g. Honda CB650R"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Year</label>
                    <input
                      type="number"
                      value={bikeYear}
                      onChange={(e) => setBikeYear(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Type</label>
                    <select
                      value={bikeType}
                      onChange={(e) => setBikeType(e.target.value as BikeType)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    >
                      <option value="any">Any</option>
                      <option value="commuter">Commuter</option>
                      <option value="sport">Sport</option>
                      <option value="adventure">Adventure</option>
                      <option value="cruiser">Cruiser</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Engine Displacement (cc)</label>
                    <input
                      type="number"
                      value={bikeEngineCc}
                      onChange={(e) => setBikeEngineCc(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Average Mileage (kmpl)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bikeMileage}
                      onChange={(e) => setBikeMileage(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-mute font-semibold uppercase tracking-wider mb-1">Service Interval (km)</label>
                    <input
                      type="number"
                      value={bikeServiceInterval}
                      onChange={(e) => setBikeServiceInterval(e.target.value)}
                      className="w-full bg-surface-deep/80 border border-hairline-strong focus:border-accent-gold rounded-lg px-4 py-2 text-ink text-sm focus:outline-none transition-all duration-200"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveBike}
                  disabled={saving}
                  className="btn btn-primary h-9 px-6 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-200"
                >
                  {saving ? "Saving..." : "Save machine"}
                </button>
              </div>
            )}
          </div>

          {/* Personal Records */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4 select-none">Personal Records</h3>
            <PersonalRecordsPanel userId={user.id} />
          </div>

          {/* Best Efforts */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
            <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-gold/20 to-transparent" />
            <h3 className="text-sm font-bold text-ink uppercase tracking-wider mb-4 select-none">Best Efforts</h3>
            <BestEffortsPanel userId={user.id} />
          </div>

          {/* Recap / archive quick links */}
          <div className="card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg flex flex-wrap gap-3">
            <Link href="/profile/year-in-rydr" className="flex-1 text-center bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider">
              Year in Rydr
            </Link>
            <Link href="/trips" className="flex-1 text-center bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider">
              My Trips
            </Link>
            <Link href={`/profile/timeline`} className="flex-1 text-center bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider">
              Photo Timeline
            </Link>
            <Link href="/heatmap" className="flex-1 text-center bg-surface-elevated hover:bg-surface-elevated text-ink px-4 py-3 rounded-lg text-xs font-bold uppercase tracking-wider">
              Ridden Ground
            </Link>
          </div>
        </div>

        {/* Bottom / Full-width Badges Shelf */}
        <div className="md:col-span-3 card-bordered p-6 bg-surface-card/30 backdrop-blur-md rounded-2xl relative shadow-lg">
          <div className="absolute top-0 inset-x-0 h-[1.5px] bg-gradient-to-r from-transparent via-accent-green/20 to-transparent" />
          <h3 className="text-xs font-bold text-accent-green tracking-widest uppercase mb-4 select-none">Badges</h3>
          <BadgeShelf
            earned={badges}
            catalog={badgeCatalog}
            showLocked
          />
        </div>
      </div>
    </div>
  );
}

// No scheduler/cron infra exists in this stack to push a real reminder
// notification on the actual day, so this is a lightweight computed
// banner instead — checked against `created_at` on every profile load,
// which is honest about what's actually achievable without new infra.
function AnniversaryBanner({ createdAt }: { createdAt: string }) {
  const joined = new Date(createdAt);
  const now = new Date();
  const isAnniversary = joined.getMonth() === now.getMonth() && joined.getDate() === now.getDate();
  const years = now.getFullYear() - joined.getFullYear();

  if (!isAnniversary || years < 1) return null;

  return (
    <div className="border border-accent-gold/30 bg-accent-gold/10 text-center px-4 py-3 rounded-xl text-sm font-semibold text-accent-gold">
      🎉 {years} year{years === 1 ? "" : "s"} on Rydr today — happy Rydr-versary!
    </div>
  );
}
