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

export function numberedGoldIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: "rydr-journey-pin",
    html: `<div style="width:26px;height:26px;border-radius:9999px;background:#e5b80b;color:#000;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #000;">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}
