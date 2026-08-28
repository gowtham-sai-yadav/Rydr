"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ClubOut } from "@/lib/api.types";

export default function ClubsPage() {
  const [clubs, setClubs] = useState<ClubOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listClubs({ q: query || undefined, limit: 50 });
      setClubs(res.clubs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clubs");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const handle = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createClub({ name: name.trim(), description: description || null, city: city || null });
      setName("");
      setDescription("");
      setCity("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create club");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinToggle = async (club: ClubOut) => {
    try {
      if (club.is_member) {
        await api.leaveClub(club.id);
      } else {
        await api.joinClub(club.id);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update membership");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">Clubs</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn btn-primary h-10 px-5 rounded-xl text-xs font-semibold uppercase tracking-wider"
        >
          {creating ? "Cancel" : "Start a club"}
        </button>
      </div>

      {creating && (
        <div className="bg-surface-card rounded-xl p-6 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Club name"
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City (optional)"
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this club about?"
            rows={3}
            className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={submitting || !name.trim()}
            className="bg-accent-gold text-canvas disabled:opacity-50 px-5 py-2 rounded-lg text-sm font-semibold"
          >
            {submitting ? "Creating…" : "Create club"}
          </button>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search clubs…"
        className="w-full bg-surface-card border border-hairline-strong rounded-lg px-4 py-2.5 text-ink text-sm"
      />

      {error && <p className="text-accent-red text-sm">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : clubs.length === 0 ? (
        <p className="text-mute text-sm text-center py-12">No clubs yet. Start one.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {clubs.map((club) => (
            <div key={club.id} className="bg-surface-card rounded-xl p-5 space-y-2">
              <Link href={`/clubs/${club.id}`} className="block">
                <h2 className="text-ink font-bold hover:text-accent-gold transition-colors">{club.name}</h2>
                {club.city && <p className="text-mute text-xs">{club.city}</p>}
                {club.description && <p className="text-body text-sm mt-1 line-clamp-2">{club.description}</p>}
              </Link>
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-mute">{club.member_count} members</span>
                <button
                  onClick={() => handleJoinToggle(club)}
                  className={`text-xs font-semibold px-4 py-1.5 rounded-lg ${
                    club.is_member ? "bg-surface-elevated text-ink" : "bg-accent-gold text-canvas"
                  }`}
                >
                  {club.is_member ? "Joined" : "Join"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
