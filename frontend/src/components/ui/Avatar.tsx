"use client";
/**
 * A rider's avatar.
 *
 * This exists because the same person rendered differently on different
 * screens. Some surfaces showed `avatar_url` when it was set; others always
 * drew the first letter of the name and ignored the field, so your own profile
 * showed "A" in a circle while your posts in the feed showed your photo. One
 * component, used everywhere, is what stops that drifting apart again.
 *
 * A photo that fails to load falls back to the initial rather than leaving the
 * browser's broken-image glyph: avatars point at third-party URLs that can and
 * do disappear, and a letter is a better answer than a torn page.
 */
import { useState } from "react";
import Link from "next/link";

// Sizes match the circles already used across the app, so swapping a
// hand-rolled div for this component does not shift any layout.
const SIZES = {
  xs: "w-6 h-6 text-[11px]",
  sm: "w-8 h-8 text-[12px]",
  md: "w-10 h-10 text-[13px]",
  lg: "w-12 h-12 text-[15px]",
  xl: "w-20 h-20 text-2xl",
  full: "w-full h-full text-2xl",
} as const;

export type AvatarSize = keyof typeof SIZES;

type Props = {
  name: string | null | undefined;
  avatarUrl?: string | null;
  size?: AvatarSize;
  /** Wraps the avatar in a link when provided. */
  href?: string;
  className?: string;
};

function initial(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export default function Avatar({
  name,
  avatarUrl,
  size = "md",
  href,
  className = "",
}: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = !!avatarUrl && !failed;

  const body = (
    <span
      className={`${SIZES[size]} shrink-0 rounded-full overflow-hidden bg-surface-elevated text-charcoal font-medium flex items-center justify-center select-none ${className}`}
      // The name sits on the wrapper rather than the img alt so the initial
      // fallback is announced too.
      aria-label={name ?? "Unknown rider"}
      title={name ?? undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl!}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        initial(name)
      )}
    </span>
  );

  if (!href) return body;
  return (
    <Link href={href} className="shrink-0 hover:opacity-80 transition-opacity">
      {body}
    </Link>
  );
}
