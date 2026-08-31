"use client";
/**
 * Rydr Button — the primary interactive primitive.
 *
 * Why this exists
 * ---------------
 * The audit found 38 places that render "the gold button" with inline
 * `bg-accent-gold text-canvas px-N py-M rounded-Z text-K font-W` and 12+
 * combinations of those values, plus 5 corner radii and 12 heights across
 * the app. Every one of those becomes `<Button variant="…" size="…">` here.
 *
 * Variants describe *purpose*, not appearance:
 *   default     — the primary CTA; the ONE bright moment in the viewport
 *   secondary   — the paired secondary (subtle surface)
 *   outline     — tertiary; transparent with a hairline
 *   ghost       — chromeless; used inside toolbars and rows
 *   destructive — a red action the user should think about
 *   link        — a text link that behaves like a button
 *
 * Sizes describe *density*, not text size:
 *   sm      — 32px, for dense toolbars and filter rails
 *   default — 40px, the everywhere size
 *   lg      — 44px, for a page's dominant CTA
 *   icon    — 40×40 square for glyph-only actions
 *
 * The `asChild` prop composes onto Next.js's `<Link>` via Radix Slot so a
 * navigation button gets Button styling without wrapping an <a> in a <button>.
 */
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  // Base — shape, focus ring, disabled state. Motion is a single token
  // ramp: 120ms on hover, snap easing on tap. Every button in the app
  // moves the same way.
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium select-none",
    "rounded-[var(--radius-button)]",
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-[120ms] ease-[cubic-bezier(0.3,1.2,0.4,1)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:pointer-events-none disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-accent-gold text-canvas shadow-[0_1px_0_0_rgba(255,255,255,0.15)_inset,0_8px_20px_-8px_rgba(245,158,11,0.45)] hover:bg-accent-gold-strong hover:-translate-y-[1px] active:translate-y-0",
        secondary:
          "bg-surface-elevated text-ink border border-hairline-strong hover:border-accent-gold/40 hover:bg-surface-elevated/80",
        outline:
          "bg-transparent text-ink border border-hairline-strong hover:border-accent-gold/40 hover:bg-white/[0.03]",
        ghost:
          "bg-transparent text-body hover:bg-white/[0.04] hover:text-ink",
        destructive:
          "bg-transparent text-accent-red border border-accent-red/30 hover:bg-accent-red/10 hover:border-accent-red/60",
        link:
          "text-accent-gold underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4 text-sm",
        lg: "h-11 px-5 text-sm font-semibold",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
