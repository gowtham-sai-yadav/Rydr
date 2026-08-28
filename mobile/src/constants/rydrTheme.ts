// Pulled directly from the web app's design tokens
// (frontend/src/app/globals.css `@theme inline` block) so the two apps
// read as the same product. Web's surface-card/elevated are translucent
// (blurred over canvas via backdrop-filter, which RN has no equivalent
// for) — those two are given solid approximations tuned for legibility
// without blur; every other value is an exact hex match to web.
export const RydrColors = {
  canvas: "#070709",
  surfaceCard: "#111116",
  surfaceElevated: "#1A1A21",
  surfaceDeep: "#030304",
  hairline: "#1C1C22",
  hairlineStrong: "#2E2E36",
  ink: "#F8FAFC",
  mute: "#94A3B8",
  ash: "#64748B",
  stone: "#475569",
  gold: "#F59E0B",
  orange: "#FF6B18",
  blue: "#06B6D4",
  red: "#EF4444",
  green: "#10B981",
  // Text color for content sitting on a solid accent-gold background
  // (buttons, badges) — matches web's .btn-primary, which uses canvas.
  onGold: "#070709",
};
