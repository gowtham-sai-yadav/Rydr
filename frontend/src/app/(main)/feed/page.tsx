"use client";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import type { PostOut } from "@/lib/api.types";
import { PostCard } from "@/components/feed/PostCard";
import Link from "next/link";

const PAGE_SIZE = 20;

export default function FeedPage() {
  const [posts, setPosts] = useState<PostOut[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [composerText, setComposerText] = useState("");
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState("");

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.getFeed({ page: 1, limit: PAGE_SIZE });
      setPosts(res.posts);
      setTotal(res.total);
      setPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const res = await api.getFeed({ page: nextPage, limit: PAGE_SIZE });
      setPosts((prev) => [...prev, ...res.posts]);
      setTotal(res.total);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more posts");
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const caption = composerText.trim();
    if (!caption) return;
    setPosting(true);
    setComposerError("");
    try {
      const post = await api.createPost({ caption });
      setPosts((prev) => [post, ...prev]);
      setTotal((t) => t + 1);
      setComposerText("");
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  };

  const hasMore = posts.length < total;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12 glow-orange">
      <div className="flex items-center justify-between">
        <h1 className="display-lg">Feed</h1>
        <Link href="/leaderboard" className="link text-sm font-medium md:hidden">
          Leaderboard →
        </Link>
      </div>

      {/* Composer */}
      <form onSubmit={handleCreatePost} className="card-bordered space-y-3">
        <textarea
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Share something with the crew…"
          className="textarea"
          disabled={posting}
        />
        {composerError && <p className="text-accent-red text-sm">{composerError}</p>}
        <div className="flex items-center justify-between">
          <p className="caption">
            To share ride photos, log the ride first, then post from there.
          </p>
          <button
            type="submit"
            disabled={posting || !composerText.trim()}
            className="btn btn-primary"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </form>

      {error && (
        <div className="border border-accent-red/30 bg-accent-red/5 text-accent-red px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-mute">No posts yet</p>
          <p className="text-stone text-sm mt-1">Be the first to share something.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="btn btn-outline"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
