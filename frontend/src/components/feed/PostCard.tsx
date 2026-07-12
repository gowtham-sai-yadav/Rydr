"use client";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "@/lib/api";
import type { PostCommentOut, PostOut } from "@/lib/api.types";
import { ReportButton } from "@/components/moderation/ReportButton";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function PostCard({ post: initialPost }: { post: PostOut }) {
  const [post, setPost] = useState(initialPost);
  const [liking, setLiking] = useState(false);
  const [justRevved, setJustRevved] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<PostCommentOut[]>([]);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState("");

  const toggleLike = async () => {
    if (liking) return;
    setLiking(true);
    setError("");
    // Optimistic update — like/unlike return 204 with no body, so this
    // client-computed state is the only source of truth; reverted on failure.
    const prev = post;
    const wasLiked = prev.liked_by_me;
    setPost((p) => ({
      ...p,
      liked_by_me: !p.liked_by_me,
      like_count: p.liked_by_me ? p.like_count - 1 : p.like_count + 1,
    }));
    if (!wasLiked) {
      setJustRevved(true);
      setTimeout(() => setJustRevved(false), 500);
    }
    try {
      if (prev.liked_by_me) {
        await api.unlikePost(prev.id);
      } else {
        await api.likePost(prev.id);
      }
    } catch (err) {
      setPost(prev);
      setError(err instanceof Error ? err.message : "Failed to update like");
    } finally {
      setLiking(false);
    }
  };

  const loadComments = async () => {
    setShowComments((v) => !v);
    if (commentsLoaded) return;
    setCommentsLoading(true);
    try {
      const res = await api.getPostComments(post.id);
      setComments(res);
      setCommentsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const submitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = commentInput.trim();
    if (!body || postingComment) return;
    setPostingComment(true);
    setError("");
    try {
      const comment = await api.addPostComment(post.id, body);
      setComments((prev) => [...prev, comment]);
      setCommentInput("");
      setPost((p) => ({ ...p, comment_count: p.comment_count + 1 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPostingComment(false);
    }
  };

  return (
    <div className="card-bordered space-y-3">
      <div className="flex items-center gap-3">
        <Link href={`/users/${post.author.id}`} className="flex items-center gap-3 hover:opacity-80">
          <div className="w-9 h-9 rounded-full bg-ink text-canvas flex items-center justify-center text-sm font-bold shrink-0">
            {post.author.name.charAt(0)}
          </div>
          <div>
            <p className="text-ink text-sm font-medium">{post.author.name}</p>
            <p className="caption">{timeAgo(post.created_at)}</p>
          </div>
        </Link>
      </div>

      {post.caption && <p className="text-body text-sm whitespace-pre-wrap break-words">{post.caption}</p>}

      {post.media.length > 0 && (
        <div className={`grid gap-2 ${post.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {post.media.map((m, i) =>
            m.media_type === "video" ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video key={i} src={m.url} controls className="w-full max-h-96 rounded-lg" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={m.url}
                alt="Post attachment"
                className="w-full max-h-96 object-cover rounded-lg"
              />
            ),
          )}
        </div>
      )}

      {error && <p className="text-accent-red text-xs">{error}</p>}

      <div className="flex items-center gap-4 pt-1 border-t border-hairline text-sm">
        <div className="relative mt-3">
          <motion.button
            type="button"
            onClick={toggleLike}
            disabled={liking}
            aria-pressed={post.liked_by_me}
            aria-label={post.liked_by_me ? "Remove rev" : "Rev this post"}
            whileTap={{ scale: 0.85 }}
            animate={justRevved ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={`flex items-center gap-1.5 transition-colors ${
              post.liked_by_me ? "text-accent-orange" : "text-charcoal hover:text-ink"
            }`}
          >
            <svg className="w-4 h-4" fill={post.liked_by_me ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span aria-hidden="true">{post.like_count}</span>
          </motion.button>
          <AnimatePresence>
            {justRevved && (
              <motion.span
                initial={{ opacity: 1, scale: 0.4, y: 0 }}
                animate={{ opacity: 0, scale: 1.6, y: -14 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="pointer-events-none absolute -top-1 left-0 text-accent-orange text-xs font-semibold"
              >
                +1 rev
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={loadComments}
          aria-label={showComments ? "Hide comments" : "Show comments"}
          className="flex items-center gap-1.5 mt-3 text-charcoal hover:text-ink transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span aria-hidden="true">{post.comment_count}</span>
        </button>
        <ReportButton targetType="post" targetId={post.id} className="mt-3 ml-auto" />
      </div>

      {showComments && (
        <div className="pt-3 border-t border-hairline space-y-3">
          {commentsLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-ink/20 border-t-ink" />
            </div>
          ) : comments.length === 0 ? (
            <p className="caption">No comments yet.</p>
          ) : (
            <div className="space-y-2">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <span className="text-ink font-medium shrink-0">{c.author.name}</span>
                  <span className="text-body break-words">{c.body}</span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={submitComment} className="flex gap-2">
            <input
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder="Add a comment…"
              maxLength={1000}
              disabled={postingComment}
              className="input flex-1"
            />
            <button
              type="submit"
              disabled={postingComment || !commentInput.trim()}
              className="btn btn-ghost"
            >
              Post
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
