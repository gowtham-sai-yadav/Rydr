"use client";
/**
 * Rydr Tabs — one control that replaces the four hand-rolled tab strips.
 *
 * Radix does the keyboard nav (Arrow/Home/End), focus management and
 * `role="tab"`/`role="tabpanel"` wiring; we own the appearance. The active
 * trigger uses a subtle gold underline rather than a solid pill so a wide
 * strip (e.g. leaderboard riders/destinations/league) reads as a nav
 * rather than a picker.
 */
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1 rounded-[var(--radius-card)] bg-surface-card border border-hairline-strong p-1",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap gap-2",
      "h-8 px-3 rounded-[var(--radius-button)] text-xs font-semibold uppercase tracking-wider",
      "text-mute transition-[color,background-color] duration-[120ms]",
      "hover:text-ink",
      "data-[state=active]:bg-accent-gold data-[state=active]:text-canvas",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/60",
      "disabled:pointer-events-none disabled:opacity-40",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("anim-fade mt-4 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
