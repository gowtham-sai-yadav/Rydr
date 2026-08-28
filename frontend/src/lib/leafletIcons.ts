import L from "leaflet";

// Leaflet's default marker icons reference image URLs that break under
// bundlers (a well-known Leaflet + webpack/Turbopack gotcha). Rather than
// reassigning L.Icon.Default's image paths, every marker in this app uses a
// custom gold SVG divIcon, so there is no dependency on Leaflet's bundled
// marker image paths at all.

const PIN_SVG = (fill: string) => `
  <svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.268 21.732 0 14 0z" fill="${fill}"/>
    <circle cx="14" cy="14" r="5.5" fill="#000000"/>
  </svg>
`;

export function goldPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "rydr-map-pin",
    html: PIN_SVG("#e5b80b"),
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}

// Fog-of-war: destinations the viewer hasn't logged a ride to yet, shown
// dimmed/grey instead of gold so the map reads as "territory to unlock".
export function fogPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "rydr-map-pin",
    html: PIN_SVG("#5a5a5a"),
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });
}

export function numberedGoldIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "rydr-journey-pin",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#e5b80b;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #000;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function stopIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "rydr-journey-pin",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#22c55e;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #000;">🍽️</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export function returnLegIcon(): L.DivIcon {
  return L.divIcon({
    className: "rydr-journey-pin",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#6b7280;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #000;">↩</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

// Deterministic colour per rider (by user id) so the same rider keeps the
// same marker colour across reconnects/re-renders during a live ride.
const RIDER_COLORS = ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];

export function riderColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return RIDER_COLORS[hash % RIDER_COLORS.length];
}

export function riderIcon(initial: string, color: string, isMe: boolean): L.DivIcon {
  return L.divIcon({
    className: "rydr-rider-pin",
    html: `<div style="width:30px;height:30px;border-radius:9999px;background:${color};color:#000;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:2.5px solid ${isMe ? "#fff" : "#000"};box-shadow:0 2px 6px rgba(0,0,0,0.4);">${initial}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

const HAZARD_EMOJI: Record<string, string> = {
  pothole: "\u{1F573}\u{FE0F}",
  gravel: "\u{1FAA8}",
  police_check: "\u{1F6A8}",
  animal_crossing: "\u{1F43E}",
  accident: "\u{26A0}\u{FE0F}",
  waterlogging: "\u{1F4A7}",
  other: "\u{2757}",
};

export function hazardIcon(hazardType: string): L.DivIcon {
  const emoji = HAZARD_EMOJI[hazardType] || HAZARD_EMOJI.other;
  return L.divIcon({
    className: "rydr-hazard-pin",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#1a1a1a;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #ef4444;">${emoji}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}
