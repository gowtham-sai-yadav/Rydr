"use client";
/**
 * Rydr Spinner — the indeterminate-loading primitive.
 *
 * Three sizes match the button sizes: sm (16), default (24), lg (32).
 * A `label` prop wraps the visual in a `role="status"` container for
 * screen readers, defaulting to "Loading".
 */
import { cn } from "@/lib/cn";

type Size = "sm" | "default" | "lg";

const sizes: Record<Size, string> = {
  sm: "h-4 w-4 border-2",
  default: "h-6 w-6 border-2",
  lg: "h-8 w-8 border-[2.5px]",
};

interface SpinnerProps {
  size?: Size;
  className?: string;
  label?: string;
  /** Centers the spinner in a vertical block — used for page/section loaders. */
  block?: boolean;
}

export function Spinner({
  size = "default",
  className,
  label = "Loading",
  block,
}: SpinnerProps) {
  const spinner = (
    <span
      className={cn(
        "inline-block rounded-full border-hairline-strong border-t-accent-gold animate-spin",
        sizes[size],
        className,
      )}
      role="status"
      aria-label={label}
    />
  );
  if (!block) return spinner;
  return (
    <div className="flex justify-center py-12">
      {spinner}
      <span className="sr-only">{label}</span>
    </div>
  );
}
