"use client";
/**
 * Rydr Metric — the signature typographic dialect.
 *
 * A number paired with its unit, set in Geist Mono with a small-caps unit
 * beside it, tight tracking, tabular numerals. This is the one visual move
 * that says "Rydr" without any words: every distance, cost, rating, count
 * and speed on the app reads like a bike-dashboard readout.
 *
 * Example: <Metric value={128} unit="km" size="lg" /> renders "128" mono
 * with "KM" as small-caps 55% size 12% tracking to the right.
 *
 * Design principle
 * ----------------
 * The number carries the weight. The unit is annotation, not decoration:
 * it never bolder than the number, never taller, never colored. When the
 * unit needs to disappear (a rating with a star icon nearby) omit it.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type MetricSize = "sm" | "default" | "lg" | "xl" | "display";

const sizeMap: Record<MetricSize, string> = {
  sm: "text-base",       // 16px — inline in a card row
  default: "text-xl",    // 20px — card headline number
  lg: "text-3xl",        // 30px — dashboard tile
  xl: "text-4xl",        // 36px — hero stat
  display: "text-6xl",   // 60px — a "look at me" moment (podium #1)
};

interface MetricProps {
  value: ReactNode;
  unit?: ReactNode;
  /** Small caption shown above the value, e.g. "Total distance". */
  label?: ReactNode;
  size?: MetricSize;
  /** Applies the accent-gold color to the value (use for the ONE metric
   *  that matters most in a viewport, otherwise leave off). */
  emphasis?: boolean;
  className?: string;
}

export function Metric({
  value,
  unit,
  label,
  size = "default",
  emphasis,
  className,
}: MetricProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-widest text-mute select-none">
          {label}
        </span>
      )}
      <div className="flex items-baseline">
        <span
          className={cn(
            "metric-value",
            sizeMap[size],
            emphasis && "text-accent-gold",
          )}
        >
          {value}
        </span>
        {unit && <span className="metric-unit">{unit}</span>}
      </div>
    </div>
  );
}
