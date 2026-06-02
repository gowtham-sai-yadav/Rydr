"use client";
import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { FollowEdgeOut } from "@/lib/api.types";


export default function FollowersListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [edges, setEdges] = useState<FollowEdgeOut[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getFollowers(id, { limit: 100 })
      .then((res) => {
        setEdges(res.edges);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-12">
      <Link href={`/users/${id}`} className="text-accent-gold hover:text-accent-gold text-sm">
        ← back
      </Link>
      <h1 className="text-2xl font-bold text-ink">Followers · {total}</h1>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : edges.length === 0 ? (
        <p className="text-mute text-center py-12">No followers yet.</p>
      ) : (
        <div className="space-y-2">
          {edges.map((e) => (
            <Link
              key={e.user.id}
              href={`/users/${e.user.id}`}
              className="flex items-center gap-3 bg-surface-card hover:bg-surface-elevated rounded-xl p-4 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-ink text-canvas flex items-center justify-center font-bold">
                {e.user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={e.user.avatar_url}
                    alt={e.user.name}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  e.user.name.charAt(0)
                )}
              </div>
              <div className="flex-1">
                <p className="text-ink font-medium">{e.user.name}</p>
                <p className="text-stone text-xs">
                  followed {new Date(e.created_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
