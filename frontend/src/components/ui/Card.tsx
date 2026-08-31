"use client";
/**
 * Rydr Card — the container of everything.
 *
 * Elevation is signalled by border, not shadow — that's the Resend rule
 * the tokens were built on. `bordered` and `elevated` are semantic: bordered
 * for a card sitting on canvas, elevated for a card sitting on top of
 * another card.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "default" | "bordered" | "elevated";
type Padding = "none" | "sm" | "default" | "lg";

const variants: Record<Variant, string> = {
  default: "bg-surface-card backdrop-blur-md",
  bordered: "bg-surface-card backdrop-blur-md border border-hairline-strong",
  elevated: "bg-surface-elevated backdrop-blur-xl border border-hairline-strong",
};

const paddings: Record<Padding, string> = {
  none: "",
  sm: "p-4",
  default: "p-6",
  lg: "p-8",
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
  padding?: Padding;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "bordered", padding = "default", ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-card)]",
        variants[variant],
        paddings[padding],
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-1.5", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn("font-display text-lg font-semibold text-ink tracking-tight", className)}
      {...props}
    />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-mute", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("", className)} {...props} />
  ),
);
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-3 pt-2", className)}
      {...props}
    />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
