"use client";
/**
 * BorderBeam — a slim highlight that travels around the border of its parent.
 *
 * Used exactly once per viewport where it lands: the #1 spot on the
 * leaderboard podium is the launching target. This is the app's rationed
 * "delight" moment — spend it in one place. Never scatter multiple beams
 * on the same page or the signature loses its meaning.
 *
 * How it works
 * ------------
 * A `::before`-like inner div holds a conic gradient rotated by the
 * `--rydr-beam-angle` custom property (registered as an <angle> in
 * globals.css so it can animate). The gradient is trimmed to a thin ring
 * by nesting a second element inset by the border width — anything simpler
 * shows the gradient as a solid disc.
 *
 * The parent must be `position: relative` and have a matching `border-radius`
 * for the beam to sit flush with its outline.
 */
import { cn } from "@/lib/cn";

interface BorderBeamProps {
  className?: string;
  duration?: number;
  colorFrom?: string;
  colorTo?: string;
  borderWidth?: number;
}

export function BorderBeam({
  className,
  duration = 6,
  colorFrom = "#f59e0b",
  colorTo = "#fbbf24",
  borderWidth = 1.5,
}: BorderBeamProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden",
        className,
      )}
    >
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={
          {
            padding: `${borderWidth}px`,
            background: `conic-gradient(from var(--rydr-beam-angle,0deg), transparent 0deg, ${colorFrom} 45deg, ${colorTo} 90deg, transparent 135deg, transparent 360deg)`,
            // Two-layer mask: the outer solid fills the whole box, the inner
            // solid punches out the interior. Where the layers overlap
            // (via mask-composite) is the border ring only.
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude",
            animation: `rydr-beam-rotate ${duration}s linear infinite`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}
