"use client";
/**
 * An image from a source we do not control, with a fallback for failure.
 *
 * Destination and ride imagery comes from seeded third-party photos and from
 * rider uploads, so a dead URL is a normal condition rather than an exception.
 * Without a handler a failed load renders the browser's broken-image glyph
 * beside the alt text, which reads as a bug; with one it falls back to a
 * tinted panel, which reads as "no photo yet".
 */
import { useState, type ReactNode } from "react";

type Props = {
  src?: string | null;
  /** Used as alt text, and as the source of the fallback initial. */
  name: string;
  className?: string;
  /** Renders eagerly. Use for a hero image above the fold. */
  priority?: boolean;
  /**
   * Shown when there is no URL or the image fails. Defaults to the name's
   * initial; ride surfaces pass their bike glyph, which suits that context
   * better than a letter.
   */
  fallback?: ReactNode;
};

export default function RemoteImage({
  src,
  name,
  className = "",
  priority = false,
  fallback,
}: Props) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading={priority ? "eager" : "lazy"}
        onError={() => setFailed(true)}
        className={`w-full h-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-elevated to-surface-deep text-stone ${className}`}
      role="img"
      aria-label={`${name}, no photo available`}
    >
      {fallback ?? (
        <span className="font-display text-3xl select-none">
          {name.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </div>
  );
}
