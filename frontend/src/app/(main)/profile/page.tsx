"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { BikeType, UserStatsOut } from "@/lib/api.types";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState<UserStatsOut | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBike, setEditBike] = useState(false);

  // Profile form state (now includes home location — needed by M2 cost calc)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [homeLat, setHomeLat] = useState("");
  const [homeLng, setHomeLng] = useState("");

  // Bike form state (now includes mileage_kmpl + engine_cc + type — feed cost calc)
  const [bikeName, setBikeName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");
  const [bikeEngineCc, setBikeEngineCc] = useState("");
  const [bikeMileage, setBikeMileage] = useState("");
  const [bikeType, setBikeType] = useState<BikeType>("any");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMyStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || "");
      setBio(user.bio || "");
      setHomeCity(user.home_city || "");
      setHomeLat(user.home_latitude?.toString() || "");
      setHomeLng(user.home_longitude?.toString() || "");
      setBikeName(user.bike?.name || "");
      setBikeModel(user.bike?.model || "");
      setBikeYear(user.bike?.year?.toString() || "");
      setBikeEngineCc(user.bike?.engine_cc?.toString() || "");
      setBikeMileage(user.bike?.mileage_kmpl?.toString() || "");
      setBikeType((user.bike?.type as BikeType) || "any");
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
      });
      await refreshUser();
      setEditBike(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bike");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <h1 className="text-2xl font-bold text-ink">Profile</h1>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Profile */}
      <div className="bg-surface-card rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-ink text-canvas flex items-center justify-center text-2xl font-bold text-ink">
              {user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-ink">{user.name}</h2>
              <p className="text-mute text-sm">{user.email}</p>
              {user.phone && <p className="text-mute text-sm">{user.phone}</p>}
              {user.home_city && (
                <p className="text-mute text-sm">📍 {user.home_city}</p>
              )}
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-accent-blue hover:text-accent-blue text-sm font-medium"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {user.bio && !editing && <p className="text-body text-sm">{user.bio}</p>}

        {editing && (
          <div className="space-y-3 mt-4 border-t border-hairline-strong pt-4">
            <div>
              <label className="block text-sm text-mute mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>
            <div>
              <label className="block text-sm text-mute mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
            </div>

            <div className="border-t border-hairline-strong pt-3">
              <p className="text-xs text-mute uppercase mb-2">
                Home location · powers cost estimates &amp; distance sort
              </p>
              <div>
                <label className="block text-sm text-mute mb-1">City</label>
                <input
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  placeholder="e.g. Bangalore"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="block text-sm text-mute mb-1">Latitude</label>
                  <input
                    value={homeLat}
                    onChange={(e) => setHomeLat(e.target.value)}
                    placeholder="12.97"
                    className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  />
                </div>
                <div>
                  <label className="block text-sm text-mute mb-1">Longitude</label>
                  <input
                    value={homeLng}
                    onChange={(e) => setHomeLng(e.target.value)}
                    placeholder="77.59"
                    className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  />
                </div>
              </div>
              <p className="text-xs text-stone mt-1">
                Right-click on Google Maps to copy lat/lng. Both fields together — leave both blank to remove.
              </p>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="bg-ink text-canvas hover:bg-surface-light disabled:opacity-50 text-ink px-6 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}
      </div>

      {/* Bike */}
      <div className="bg-surface-card rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink">My Bike</h3>
          <button
            onClick={() => setEditBike(!editBike)}
            className="text-accent-blue hover:text-accent-blue text-sm font-medium"
          >
            {editBike ? "Cancel" : "Edit"}
          </button>
        </div>

        {!editBike ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-mute uppercase">Name</p>
              <p className="text-ink font-medium">{user.bike?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Model</p>
              <p className="text-ink font-medium">{user.bike?.model || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Year</p>
              <p className="text-ink font-medium">{user.bike?.year || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Engine</p>
              <p className="text-ink font-medium">
                {user.bike?.engine_cc ? `${user.bike.engine_cc} cc` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Mileage</p>
              <p className="text-ink font-medium">
                {user.bike?.mileage_kmpl ? `${user.bike.mileage_kmpl} kmpl` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-mute uppercase">Type</p>
              <p className="text-ink font-medium capitalize">{user.bike?.type ?? "any"}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-mute mb-1">Name</label>
                <input
                  value={bikeName}
                  onChange={(e) => setBikeName(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  placeholder="Shadow"
                />
              </div>
              <div>
                <label className="block text-sm text-mute mb-1">Model</label>
                <input
                  value={bikeModel}
                  onChange={(e) => setBikeModel(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  placeholder="Honda CB650R"
                />
              </div>
              <div>
                <label className="block text-sm text-mute mb-1">Year</label>
                <input
                  type="number"
                  value={bikeYear}
                  onChange={(e) => setBikeYear(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                />
              </div>
              <div>
                <label className="block text-sm text-mute mb-1">Type</label>
                <select
                  value={bikeType}
                  onChange={(e) => setBikeType(e.target.value as BikeType)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                >
                  <option value="any">Any</option>
                  <option value="commuter">Commuter</option>
                  <option value="sport">Sport</option>
                  <option value="adventure">Adventure</option>
                  <option value="cruiser">Cruiser</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-mute mb-1">Engine (cc)</label>
                <input
                  type="number"
                  value={bikeEngineCc}
                  onChange={(e) => setBikeEngineCc(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                />
              </div>
              <div>
                <label className="block text-sm text-mute mb-1">Mileage (kmpl) *</label>
                <input
                  type="number"
                  step="0.1"
                  value={bikeMileage}
                  onChange={(e) => setBikeMileage(e.target.value)}
                  className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-ink/30"
                  placeholder="21"
                />
              </div>
            </div>
            <p className="text-xs text-stone">
              Mileage powers the fuel cost estimate on destinations.
            </p>
            <button
              onClick={handleSaveBike}
              disabled={saving}
              className="bg-ink text-canvas hover:bg-surface-light disabled:opacity-50 text-ink px-6 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? "Saving…" : "Save bike"}
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="bg-surface-card rounded-xl p-6">
        <h3 className="text-lg font-semibold text-ink mb-4">Ride stats</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-blue">{stats?.rides_captained ?? 0}</p>
            <p className="text-xs text-mute uppercase mt-1">Captained</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-blue">{stats?.rides_joined ?? 0}</p>
            <p className="text-xs text-mute uppercase mt-1">Joined</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-accent-blue">{stats?.rides_completed ?? 0}</p>
            <p className="text-xs text-mute uppercase mt-1">Completed</p>
          </div>
        </div>
      </div>

      {/* Follow surface */}
      <div className="bg-surface-card rounded-xl p-6">
        <h3 className="text-lg font-semibold text-ink mb-3">Social</h3>
        <div className="flex gap-6 text-sm">
          <a
            href={`/users/${user.id}/followers`}
            className="text-body hover:text-accent-blue"
          >
            <span className="text-ink font-semibold">{user.followers_count}</span>{" "}
            <span>followers</span>
          </a>
          <a
            href={`/users/${user.id}/following`}
            className="text-body hover:text-accent-blue"
          >
            <span className="text-ink font-semibold">{user.following_count}</span>{" "}
            <span>following</span>
          </a>
        </div>
      </div>
    </div>
  );
}
