"use client";
/**
 * Rydr Input / Textarea — one shape, everywhere.
 *
 * Base: h-10, px-3, surface-card ground, hairline-strong border, gold focus
 * ring. No page is allowed to override padding — if a search box needs a
 * leading icon, wrap it in InputGroup rather than reinventing paddings.
 */
import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const baseField = [
  "w-full bg-surface-card text-ink placeholder:text-stone",
  "border border-hairline-strong",
  "rounded-[var(--radius-input)]",
  "transition-[border-color,box-shadow]",
  "duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
  "focus:outline-none focus:border-accent-gold focus:shadow-[0_0_0_3px_var(--color-accent-gold-glow)]",
  "disabled:opacity-50 disabled:cursor-not-allowed",
].join(" ");

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(baseField, "h-10 px-3 text-sm", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(baseField, "px-3 py-2 text-sm resize-none", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Input, Textarea };
