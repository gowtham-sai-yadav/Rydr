"use client";
/**
 * Rydr Skeleton — content-shaped placeholder for while data loads.
 *
 * A subtle sheen sweeps across the surface every 1.6s; on a busy screen
 * that reads as motion, but a single skeleton is quiet. Prefer this over
 * a spinner whenever the eventual content has a predictable shape.
 */
import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-surface-elevated/60 rounded-[var(--radius-input)]",
        "before:content-[''] before:absolute before:inset-0",
        "before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.04),transparent)]",
        "before:animate-[rydr-skeleton-shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  );
}
