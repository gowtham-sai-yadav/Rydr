"use client";
import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type {
  ClubBadgeOut,
  ClubChallengeOut,
  ClubLeaderboardEntry,
  ClubMemberOut,
  ClubOut,
} from "@/lib/api.types";

type Tab = "members" | "leaderboard" | "badges" | "challenges";

export default function ClubDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [club, setClub] = useState<ClubOut | null>(null);
  const [members, setMembers] = useState<ClubMemberOut[]>([]);
  const [leaderboard, setLeaderboard] = useState<ClubLeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [badges, setBadges] = useState<ClubBadgeOut[]>([]);
  const [challenges, setChallenges] = useState<ClubChallengeOut[]>([]);
  const [tab, setTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isAdmin = club?.my_role === "admin";

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([api.getClub(id), api.listClubMembers(id)]);
      setClub(c);
      setMembers(m.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load club");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (tab === "leaderboard") {
      api.getClubLeaderboard(id, period).then((res) => setLeaderboard(res.entries)).catch(() => {});
    } else if (tab === "badges") {
      api.listClubBadges(id).then(setBadges).catch(() => {});
    } else if (tab === "challenges") {
      api.listClubChallenges(id).then((res) => setChallenges(res.challenges)).catch(() => {});
    }
  }, [tab, id, period]);

  const handleJoinToggle = async () => {
    if (!club) return;
    setBusy(true);
    try {
      if (club.is_member) await api.leaveClub(club.id);
      else await api.joinClub(club.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update membership");
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

  if (!club) {
    return <div className="text-center py-12 text-mute">{error || "Club not found"}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="bg-surface-card rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{club.name}</h1>
            {club.city && <p className="text-mute text-sm">{club.city}</p>}
            {club.description && <p className="text-body text-sm mt-2">{club.description}</p>}
            <p className="text-mute text-xs mt-2">{club.member_count} members</p>
          </div>
          <button
            onClick={handleJoinToggle}
            disabled={busy}
            className={`shrink-0 text-sm font-semibold px-5 py-2 rounded-lg disabled:opacity-50 ${
              club.is_member ? "bg-surface-elevated text-ink" : "bg-accent-gold text-canvas"
            }`}
          >
            {club.is_member ? "Leave" : "Join"}
          </button>
        </div>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}

      <div className="flex gap-1.5 bg-surface-card/40 border border-hairline-strong p-1 rounded-xl w-fit">
        {(["members", "leaderboard", "badges", "challenges"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider capitalize ${
              tab === t ? "bg-accent-gold text-canvas" : "text-mute hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="space-y-2">
          {members.map((m) => (
            <Link
              key={m.user.id}
              href={`/users/${m.user.id}`}
              className="flex items-center gap-3 bg-surface-card rounded-lg px-4 py-3 hover:bg-surface-elevated/40"
            >
              <div className="w-8 h-8 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold">
                {m.user.name.charAt(0)}
              </div>
              <span className="text-ink text-sm font-medium flex-1">{m.user.name}</span>
              {m.role === "admin" && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent-gold">Admin</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {tab === "leaderboard" && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(["week", "month"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                  period === p ? "bg-accent-gold text-canvas" : "bg-surface-card text-mute"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-mute text-sm">No distance logged this {period} yet.</p>
          ) : (
            leaderboard.map((entry) => (
              <Link
                key={entry.user.id}
                href={`/users/${entry.user.id}`}
                className="flex items-center gap-3 bg-surface-card rounded-lg px-4 py-3 hover:bg-surface-elevated/40"
              >
                <span className="text-mute text-xs font-bold w-6 text-center">#{entry.rank}</span>
                <div className="w-8 h-8 rounded-full bg-ink text-canvas flex items-center justify-center text-xs font-bold">
                  {entry.user.name.charAt(0)}
                </div>
                <span className="text-ink text-sm font-medium flex-1">{entry.user.name}</span>
                <span className="text-accent-gold text-xs font-bold">{entry.distance_km.toFixed(0)} km</span>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "badges" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {badges.length === 0 ? (
            <p className="text-mute text-sm col-span-full">No custom badges yet.</p>
          ) : (
            badges.map((b) => (
              <div key={b.id} className="bg-surface-card rounded-xl p-4 text-center">
                <p className="text-ink font-bold text-xs">{b.name}</p>
                <p className="text-mute text-[10px] mt-1">{b.description}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "challenges" && (
        <div className="space-y-3">
          {challenges.length === 0 ? (
            <p className="text-mute text-sm">No challenges running.</p>
          ) : (
            challenges.map((c) => (
              <div key={c.id} className="bg-surface-card rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <p className="text-ink font-bold text-sm">{c.title}</p>
                  {c.is_complete && (
                    <span className="text-[10px] font-bold uppercase text-accent-green">Complete</span>
                  )}
                </div>
                <p className="text-mute text-xs mt-1">
                  {c.start_date} → {c.end_date}
                </p>
                <div className="w-full h-1.5 bg-surface-deep rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full ${c.is_complete ? "bg-accent-green" : "bg-accent-gold"}`}
                    style={{ width: `${Math.min(100, (c.progress_km / c.goal_km) * 100)}%` }}
                  />
                </div>
                <p className="text-mute text-xs mt-1">{c.progress_km.toFixed(0)} / {c.goal_km} km</p>
              </div>
            ))
          )}
          {isAdmin && <ChallengeCreateForm clubId={id} onCreated={() => api.listClubChallenges(id).then((res) => setChallenges(res.challenges))} />}
        </div>
      )}

      {isAdmin && tab === "badges" && (
        <BadgeCreateForm clubId={id} onCreated={() => api.listClubBadges(id).then(setBadges)} />
      )}
    </div>
  );
}

function BadgeCreateForm({ clubId, onCreated }: { clubId: string; onCreated: () => void }) {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!slug.trim() || !name.trim() || !description.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createClubBadge(clubId, { slug: slug.trim(), name: name.trim(), description: description.trim() });
      setSlug("");
      setName("");
      setDescription("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create badge");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-xl p-4 space-y-2">
      <p className="text-xs text-mute uppercase font-semibold">New club badge (admin)</p>
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug (e.g. century-rider)" className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      {error && <p className="text-accent-red text-xs">{error}</p>}
      <button onClick={submit} disabled={submitting} className="bg-accent-gold text-canvas disabled:opacity-50 px-4 py-1.5 rounded-lg text-xs font-semibold">
        {submitting ? "Creating…" : "Create badge"}
      </button>
    </div>
  );
}

function ChallengeCreateForm({ clubId, onCreated }: { clubId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [goalKm, setGoalKm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    const goal = parseFloat(goalKm);
    if (!title.trim() || Number.isNaN(goal) || !startDate || !endDate) return;
    setSubmitting(true);
    setError("");
    try {
      await api.createClubChallenge(clubId, { title: title.trim(), goal_km: goal, start_date: startDate, end_date: endDate });
      setTitle("");
      setGoalKm("");
      setStartDate("");
      setEndDate("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-surface-card rounded-xl p-4 space-y-2">
      <p className="text-xs text-mute uppercase font-semibold">New challenge (admin)</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      <input value={goalKm} onChange={(e) => setGoalKm(e.target.value)} type="number" placeholder="Goal (km)" className="w-full bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      <div className="flex gap-2">
        <input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" className="flex-1 bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
        <input value={endDate} onChange={(e) => setEndDate(e.target.value)} type="date" className="flex-1 bg-surface-elevated border border-hairline-strong rounded-lg px-3 py-2 text-ink text-sm" />
      </div>
      {error && <p className="text-accent-red text-xs">{error}</p>}
      <button onClick={submit} disabled={submitting} className="bg-accent-gold text-canvas disabled:opacity-50 px-4 py-1.5 rounded-lg text-xs font-semibold">
        {submitting ? "Creating…" : "Create challenge"}
      </button>
    </div>
  );
}
