"use client";
/**
 * Rydr Badge — the small text-with-background element used for status,
 * count, tag, and label. This is the "chip"-shaped one; for a filter
 * pill see the `Chip` in the same folder.
 *
 * Variants are semantic. `gold` is reserved for the ONE most important
 * signal in a viewport (e.g., "You're captain"); anything else is drift.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider select-none transition-colors duration-[120ms]",
  {
    variants: {
      variant: {
        default: "bg-surface-elevated text-body border border-hairline-strong",
        outline: "bg-transparent text-mute border border-hairline-strong",
        gold: "bg-accent-gold/15 text-accent-gold border border-accent-gold/30",
        success: "bg-accent-green/10 text-accent-green border border-accent-green/25",
        warning: "bg-accent-orange/10 text-accent-orange border border-accent-orange/30",
        destructive: "bg-accent-red/10 text-accent-red border border-accent-red/30",
        blue: "bg-accent-blue/10 text-accent-blue border border-accent-blue/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ variant, className }))} {...props} />
  ),
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
