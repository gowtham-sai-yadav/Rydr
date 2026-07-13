"use client";
/**
 * One post in the community feed — Phase 4 W4.
 *
 * Likes and comments are optimistic: the count moves the moment the user
 * taps, and reverts if the request fails. A feed that waits for a round trip
 * before acknowledging a tap feels broken on a phone connection, which is the
 * connection this app is used on.
 */
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

import { api } from "@/lib/api";
import type { PostCommentOut, PostOut, UserOut } from "@/lib/api.types";
import ReportButton from "@/components/moderation/ReportButton";
import { routes } from "@/lib/routes";

type Props = {
  post: PostOut;
  viewer: UserOut | null;
  onDeleted?: (id: string) => void;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function PostCard({ post, viewer, onDeleted }: Props) {
  const [liked, setLiked] = useState(post.liked_by_me === true);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [justRevved, setJustRevved] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [comments, setComments] = useState<PostCommentOut[] | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isMine = viewer?.id === post.author?.id;

  async function toggleLike() {
    if (!viewer) return;
    // Optimistic. Snapshot first so the revert restores the real value
    // rather than assuming the delta.
    const prevLiked = liked;
    const prevCount = likeCount;
    setLiked(!prevLiked);
    setLikeCount(prevCount + (prevLiked ? -1 : 1));
    if (!prevLiked) {
      setJustRevved(true);
      setTimeout(() => setJustRevved(false), 500);
    }
    try {
      const res = prevLiked
        ? await api.unlikePost(post.id)
        : await api.likePost(post.id);
      // Trust the server's count over the optimistic one — another rider may
      // have liked it in the meantime.
      setLikeCount(res.like_count);
      setLiked(res.liked);
    } catch {
      setLiked(prevLiked);
      setLikeCount(prevCount);
      setError("Could not update your like");
    }
  }

  async function loadComments() {
    if (comments) {
      setComments(null);
      return;
    }
    try {
      const res = await api.listComments(post.id, { limit: 50 });
      setComments(res.comments);
      setCommentCount(res.total);
    } catch {
      setError("Could not load comments");
    }
  }

  async function submitComment() {
    const body = commentDraft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const created = await api.createComment(post.id, body);
      setComments((c) => [...(c ?? []), created]);
      setCommentCount((n) => n + 1);
      setCommentDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not post comment");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this post? Its likes and comments go with it.")) return;
    try {
      await api.deletePost(post.id);
      onDeleted?.(post.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  return (
    <article className="bg-surface-card rounded-xl p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {post.author && (
            <Link
              href={routes.user(post.author.id)}
              className="shrink-0 w-9 h-9 rounded-full bg-surface-elevated overflow-hidden flex items-center justify-center text-[13px] text-charcoal"
            >
              {post.author.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={post.author.avatar_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                post.author.name.slice(0, 1).toUpperCase()
              )}
            </Link>
          )}
          <div className="min-w-0">
            <p className="text-[14px] text-ink font-medium truncate">
              {post.author?.name ?? "Unknown rider"}
            </p>
            <p className="text-[12px] text-mute">
              {relativeTime(post.created_at)}
              {post.destination && (
                <>
                  {" · "}
                  <Link
                    href={routes.destination(post.destination.id)}
                    className="text-link hover:underline"
                  >
                    {post.destination.name}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isMine ? (
            <button
              onClick={remove}
              className="text-[12px] text-mute hover:text-accent-red transition-colors"
            >
              Delete
            </button>
          ) : (
            viewer && (
              <ReportButton contentType="post" contentId={post.id} label="Report" />
            )
          )}
        </div>
      </header>

      <p className="mt-3 text-[15px] text-body whitespace-pre-wrap break-words">
        {post.body}
      </p>

      {post.media.length > 0 && (
        <div
          className={`mt-3 grid gap-2 ${
            post.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {post.media.map((m) => (
            <div
              key={m.id}
              className="rounded-lg overflow-hidden bg-surface-elevated aspect-video"
            >
              {m.media_type === "video" ? (
                // Poster comes from the derived thumbnail when there is one;
                // null means Cloudinary could not derive it, so fall back to
                // letting the browser pick a frame.
                <video
                  src={m.url}
                  poster={m.thumbnail_url ?? undefined}
                  controls
                  preload="none"
                  className="w-full h-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.thumbnail_url ?? m.url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          ))}
        </div>
      )}

      <footer className="mt-4 flex items-center gap-4 text-[13px]">
        <div className="relative">
          <motion.button
            onClick={toggleLike}
            disabled={!viewer}
            aria-pressed={liked}
            whileTap={{ scale: 0.85 }}
            animate={justRevved ? { scale: [1, 1.35, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            // Anonymous readers get a neutral, disabled control rather than an
            // unliked heart that implies they have a session.
            className={`flex items-center gap-1.5 py-2 pr-3 transition-colors disabled:opacity-40 disabled:cursor-default ${
              liked ? "text-accent-red" : "text-charcoal hover:text-ink"
            }`}
          >
            <span aria-hidden>{liked ? "♥" : "♡"}</span>
            <span>{likeCount}</span>
          </motion.button>
          <AnimatePresence>
            {justRevved && (
              <motion.span
                initial={{ opacity: 1, scale: 0.4, y: 0 }}
                animate={{ opacity: 0, scale: 1.6, y: -14 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="pointer-events-none absolute -top-1 left-0 text-accent-red text-xs font-semibold"
              >
                +1 rev
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={loadComments}
          className="flex items-center gap-1.5 py-2 px-1 text-charcoal hover:text-ink transition-colors"
        >
          <span aria-hidden>💬</span>
          <span>{commentCount}</span>
        </button>
      </footer>

      {error && <p className="mt-2 text-[12px] text-accent-red">{error}</p>}

      {comments && (
        <div className="mt-4 pt-4 border-t border-hairline space-y-3">
          {comments.length === 0 && (
            <p className="text-[13px] text-mute">No comments yet.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="text-[13px]">
              <span className="text-ink font-medium">
                {c.author?.name ?? "Unknown"}
              </span>{" "}
              <span className="text-mute text-[12px]">
                {relativeTime(c.created_at)}
              </span>
              <p className="text-body whitespace-pre-wrap break-words">{c.body}</p>
            </div>
          ))}

          {viewer && (
            <div className="flex gap-2 pt-1">
              <input
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitComment()}
                placeholder="Add a comment…"
                maxLength={2000}
                className="flex-1 bg-surface-elevated border border-hairline rounded-lg px-3 py-1.5 text-[13px] text-ink placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-ink/30"
              />
              <button
                onClick={submitComment}
                disabled={busy || !commentDraft.trim()}
                className="bg-ink text-canvas text-[13px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-40"
              >
                Post
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
