"use client";
/**
 * LostRoadSvg — the 404 illustration.
 *
 * A winding two-lane road drawn in perspective, its dashed centre-line
 * receding into fog. The line strokes itself in on load, then holds. The
 * road surface fades out where the centre-line ends, so the visual message
 * is "the road you were on ends here, gently" — not "error, broken, red."
 *
 * The animation runs once at mount rather than looping: a looping stroke
 * on a page a viewer sits with reads as pulsing noise. Reduced-motion
 * skips the draw and renders the finished line.
 *
 * Design specifics
 * ----------------
 * The road is symmetric around the horizontal centre; that lets the same
 * SVG land cleanly on a wide desktop and a portrait phone. The vanishing
 * point is high (viewBox y=40) so a headline above it doesn't feel like
 * it is sitting on the horizon.
 */
export function LostRoadSvg({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 640 360"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        {/* Radial atmospheric wash behind the road — gold at the horizon,
            fades out. This is the same gold token the rest of the app uses. */}
        <radialGradient id="rydr-lost-glow" cx="50%" cy="24%" r="55%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.14" />
          <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.03" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>

        {/* Fog mask that eats the road as it recedes. */}
        <linearGradient id="rydr-lost-road" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#0b0b0f" stopOpacity="0" />
          <stop offset="30%" stopColor="#0b0b0f" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#141419" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Ground wash */}
      <rect x="0" y="0" width="640" height="360" fill="url(#rydr-lost-glow)" />

      {/* Distant hairline horizon — Rydr's "hairline instead of shadow" motif. */}
      <line
        x1="140"
        y1="88"
        x2="500"
        y2="88"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth="1"
      />

      {/* Road surface: a taper from the vanishing point down and out.
          Filled with the fog gradient so the near-camera portion is opaque
          and the far end merges into the canvas. */}
      <path
        d="M 320 90 L 560 340 L 80 340 Z"
        fill="url(#rydr-lost-road)"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="1"
      />

      {/* Edge lines — thin. Left */}
      <line
        x1="320"
        y1="90"
        x2="80"
        y2="340"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.25"
      />
      {/* Right */}
      <line
        x1="320"
        y1="90"
        x2="560"
        y2="340"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.25"
      />

      {/* Dashed centre-line, drawn on mount. `pathLength=1` normalises the
          geometry so `stroke-dasharray` / `stroke-dashoffset` can be simple
          fractions rather than tied to actual pixel length. */}
      <line
        x1="320"
        y1="98"
        x2="320"
        y2="340"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="0.05 0.03"
        pathLength={1}
        style={{
          strokeDashoffset: 1,
          animation:
            "rydr-lost-road-draw 1600ms cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards",
        }}
      />

      {/* Tail of the centre-line: three short strokes fading up into fog,
          telling the eye "and it continued beyond this…" — kept subtle. */}
      {[
        { y: 82, opacity: 0.18 },
        { y: 74, opacity: 0.1 },
        { y: 67, opacity: 0.05 },
      ].map((seg, i) => (
        <line
          key={i}
          x1="320"
          y1={seg.y}
          x2="320"
          y2={seg.y - 4}
          stroke="#f59e0b"
          strokeWidth="2"
          strokeOpacity={seg.opacity}
          strokeLinecap="round"
        />
      ))}

      {/* Compass-needle at the vanishing point — a small hint that the map
          is where you are, not where the app failed. Slow, subtle drift. */}
      <g
        transform="translate(320 72)"
        style={{
          transformOrigin: "center",
          animation:
            "rydr-lost-compass-drift 8s ease-in-out infinite alternate",
        }}
      >
        <circle
          r="5"
          fill="rgba(11,11,15,0.85)"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1"
        />
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="-3.5"
          stroke="#f59e0b"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>

      <style>{`
        @keyframes rydr-lost-road-draw {
          from { stroke-dashoffset: 1; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes rydr-lost-compass-drift {
          from { transform: translate(320px, 72px) rotate(-14deg); }
          to   { transform: translate(320px, 72px) rotate(18deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="rydr-lost-road-draw"] { animation: none !important; stroke-dashoffset: 0 !important; }
          [style*="rydr-lost-compass-drift"] { animation: none !important; }
        }
      `}</style>
    </svg>
  );
}
