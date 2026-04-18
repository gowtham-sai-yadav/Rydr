"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { UserStats } from "@/lib/types";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [editing, setEditing] = useState(false);
  const [editBike, setEditBike] = useState(false);

  // Edit form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [bikeName, setBikeName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getMyStats().then((s) => setStats(s as UserStats));
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setPhone(user.phone || "");
      setBio(user.bio || "");
      setBikeName(user.bike?.name || "");
      setBikeModel(user.bike?.model || "");
      setBikeYear(user.bike?.year?.toString() || "");
    }
  }, [user]);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await api.updateMe({ name, phone: phone || null, bio: bio || null });
      await refreshUser();
      setEditing(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBike = async () => {
    setSaving(true);
    try {
      await api.updateBike({
        name: bikeName || null,
        model: bikeModel || null,
        year: bikeYear ? parseInt(bikeYear) : null,
      });
      await refreshUser();
      setEditBike(false);
    } catch {
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      {/* Profile Card */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-orange-600 flex items-center justify-center text-2xl font-bold text-white">
              {user.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{user.name}</h2>
              <p className="text-gray-400 text-sm">{user.email}</p>
              {user.phone && <p className="text-gray-400 text-sm">{user.phone}</p>}
            </div>
          </div>
          <button
            onClick={() => setEditing(!editing)}
            className="text-orange-500 hover:text-orange-400 text-sm font-medium"
          >
            {editing ? "Cancel" : "Edit"}
          </button>
        </div>

        {user.bio && !editing && (
          <p className="text-gray-300 text-sm">{user.bio}</p>
        )}

        {editing && (
          <div className="space-y-3 mt-4 border-t border-gray-700 pt-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Bike Card */}
      <div className="bg-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">My Bike</h3>
          <button
            onClick={() => setEditBike(!editBike)}
            className="text-orange-500 hover:text-orange-400 text-sm font-medium"
          >
            {editBike ? "Cancel" : "Edit"}
          </button>
        </div>

        {!editBike ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase">Name</p>
              <p className="text-white font-medium">{user.bike?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Model</p>
              <p className="text-white font-medium">{user.bike?.model || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase">Year</p>
              <p className="text-white font-medium">{user.bike?.year || "—"}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Bike Name</label>
              <input
                value={bikeName}
                onChange={(e) => setBikeName(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Model</label>
              <input
                value={bikeModel}
                onChange={(e) => setBikeModel(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Year</label>
              <input
                type="number"
                value={bikeYear}
                onChange={(e) => setBikeYear(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <button
              onClick={handleSaveBike}
              disabled={saving}
              className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium"
            >
              {saving ? "Saving..." : "Save Bike"}
            </button>
          </div>
        )}
      </div>

      {/* Stats Card */}
      <div className="bg-gray-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Ride Stats</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-500">{stats?.rides_captained ?? 0}</p>
            <p className="text-xs text-gray-400 uppercase mt-1">Captained</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-500">{stats?.rides_joined ?? 0}</p>
            <p className="text-xs text-gray-400 uppercase mt-1">Joined</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-orange-500">{stats?.rides_completed ?? 0}</p>
            <p className="text-xs text-gray-400 uppercase mt-1">Completed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
