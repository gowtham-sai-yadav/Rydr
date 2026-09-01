"use client";
/**
 * Community feed — Phase 4 W4.
 *
 * "All" and "Following" tabs. Following requires auth (the API returns 401
 * without it), so the tab is hidden rather than shown-and-failing for a
 * logged-out reader.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { PostOut } from "@/lib/api.types";
import PostCard from "@/components/feed/PostCard";
import {
  Alert,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@/components/ui";

type Scope = "all" | "following";
const PAGE_SIZE = 20;

export default function FeedPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const [posts, setPosts] = useState<PostOut[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(
    async (targetPage: number, targetScope: Scope) => {
      setLoading(true);
      setError("");
      try {
        const res = await api.listPosts({
          following_only: targetScope === "following",
          page: targetPage,
          limit: PAGE_SIZE,
        });
        // Append when paging, replace when the scope changed.
        setPosts((prev) =>
          targetPage === 1 ? res.posts : [...prev, ...res.posts]
        );
        setTotal(res.total);
        setPage(targetPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the feed");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void load(1, scope);
  }, [scope, load]);

  async function submit() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError("");
    try {
      const created = await api.createPost({ body });
      // Prepend rather than refetching: the feed is newest-first, so the new
      // post belongs at the top and a refetch would lose the reader's place.
      setPosts((p) => [created, ...p]);
      setTotal((t) => t + 1);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post");
    } finally {
      setPosting(false);
    }
  }

  const hasMore = posts.length < total;

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-12 glow-orange">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display text-2xl font-bold text-ink tracking-tight">Feed</h1>
        <div className="flex items-center gap-3">
          {user && (
            <Tabs value={scope} onValueChange={(v) => setScope(v as Scope)}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="following">Following</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <Link href="/leaderboard" className="link text-sm font-medium md:hidden">
            Leaderboard →
          </Link>
        </div>
      </div>

      {user && (
        <div className="bg-surface-card border border-hairline rounded-[var(--radius-card)] p-4 space-y-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Where did you ride? What was the road like?"
            rows={3}
            maxLength={5000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-stone">{draft.length}/5000</span>
            <Button
              size="sm"
              onClick={submit}
              disabled={posting || !draft.trim()}
            >
              {posting ? "Posting…" : "Post"}
            </Button>
          </div>
        </div>
      )}

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && posts.length === 0 && (
        <div className="space-y-3" role="status" aria-label="Loading feed">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-surface-card rounded-xl p-5 animate-pulse space-y-3"
            >
              <div className="h-9 w-9 rounded-full bg-surface-elevated" />
              <div className="h-3 w-2/3 rounded bg-surface-elevated" />
              <div className="h-3 w-1/2 rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="bg-surface-card rounded-xl p-8 text-center">
          <p className="text-ink font-medium">
            {scope === "following"
              ? "Nobody you follow has posted yet"
              : "No posts yet"}
          </p>
          <p className="text-[13px] text-mute mt-1">
            {scope === "following"
              ? "Follow a few riders and their recaps will show up here."
              : "Be the first — log a ride and tell everyone how the road was."}
          </p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {posts.map((post, i) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}
          >
            <PostCard
              post={post}
              viewer={user}
              onDeleted={(id) => {
                setPosts((p) => p.filter((x) => x.id !== id));
                setTotal((t) => Math.max(0, t - 1));
              }}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {hasMore && (
        <Button
          variant="secondary"
          onClick={() => void load(page + 1, scope)}
          disabled={loading}
          className="w-full h-11"
        >
          {loading ? "Loading…" : `Load more (${total - posts.length} left)`}
        </Button>
      )}
    </div>
  );
}
