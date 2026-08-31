"use client";
import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import type { FollowEdgeOut } from "@/lib/api.types";
import { routes } from "@/lib/routes";
import Avatar from "@/components/ui/Avatar";


function FollowersListPageInner() {
  // Phase 4 W9: the record id arrives as a query parameter rather than a
  // path segment, so this route is one file that Next can statically
  // export for the Capacitor build. See lib/routes.ts for why.
  const id = useSearchParams().get("id") ?? "";

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
      <Link href={routes.user(id)} className="text-accent-blue hover:text-accent-blue text-sm">
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
              href={routes.user(e.user.id)}
              className="flex items-center gap-3 bg-surface-card hover:bg-surface-elevated rounded-xl p-4 transition-colors"
            >
              <Avatar
                name={e.user.name}
                avatarUrl={e.user.avatar_url}
                size="md"
              />
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


/**
 * Suspense boundary around FollowersListPageInner.
 *
 * `useSearchParams` suspends during prerender, and the static export fails
 * with a missing-suspense-boundary error without this wrapper.
 */
export default function FollowersListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      }
    >
      <FollowersListPageInner />
    </Suspense>
  );
}
