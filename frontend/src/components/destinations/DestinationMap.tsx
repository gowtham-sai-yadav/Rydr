"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fogPinIcon, goldPinIcon } from "@/lib/leafletIcons";

export interface DestinationMapPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region?: string | null;
}

interface DestinationMapProps {
  destinations: DestinationMapPoint[];
  height?: number | string;
  className?: string;
  /** Fog-of-war: when passed, destinations not in this set render as a
   * dimmed grey pin instead of gold — "territory not yet unlocked". Omit
   * entirely to keep every pin gold (the default, non-fog behavior). */
  visitedIds?: Set<string>;
}

// Read-only browsing map - one pin per destination, click through to the
// detail page. Built on plain Leaflet + OpenStreetMap tiles, so it needs no
// API key or account. Falls back to a plain list only if the map library
// fails to initialize (e.g. an SSR mismatch).
export default function DestinationMap({
  destinations,
  height = 360,
  className = "",
  visitedIds,
}: DestinationMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!containerRef.current || destinations.length === 0) return;

    try {
      // Interactions start locked so a vertical swipe over the map scrolls
      // the page instead of panning/zooming it — a two-finger-scroll trap
      // was the #1 mobile complaint. A single tap unlocks the map.
      const map = L.map(containerRef.current, {
        center: [destinations[0].latitude, destinations[0].longitude],
        zoom: 8,
        dragging: false,
        scrollWheelZoom: false,
        touchZoom: false,
        doubleClickZoom: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markers: L.Marker[] = [];
      destinations.forEach((d) => {
        const isFogged = visitedIds != null && !visitedIds.has(d.id);
        const marker = L.marker([d.latitude, d.longitude], { icon: isFogged ? fogPinIcon() : goldPinIcon() })
          .addTo(map)
          .bindPopup(`<strong>${escapeHtml(d.name)}</strong>${isFogged ? '<br/><span style="opacity:0.6;font-size:11px">not visited yet</span>' : ""}`);
        marker.on("click", () => router.push(`/destinations/${d.id}`));
        markers.push(marker);
      });

      if (destinations.length > 1) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 12 });
      }

      const unlock = () => {
        map.dragging.enable();
        map.scrollWheelZoom.enable();
        map.touchZoom.enable();
        map.doubleClickZoom.enable();
        setActive(true);
      };
      // Leaflet's tap handler fires "click" for a genuine tap even while
      // dragging is disabled, but not for a swipe/scroll gesture — so this
      // only unlocks on deliberate interaction, never on a page-scroll swipe.
      map.once("click", unlock);
    } catch {
      setFailed(true);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      setActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations, visitedIds]);

  if (destinations.length === 0 || failed) {
    return (
      <div
        className={`bg-surface-card rounded-xl p-4 ${className}`}
        style={{ minHeight: typeof height === "number" ? height : undefined }}
      >
        {destinations.length === 0 ? (
          <p className="text-mute text-sm">No destinations to show on a map.</p>
        ) : (
          <>
            <p className="text-xs text-mute mb-3">Map unavailable. Showing a list instead.</p>
            <ul className="space-y-2">
              {destinations.map((d) => (
                <li key={d.id}>
                  <Link href={`/destinations/${d.id}`} className="link text-sm font-medium">
                    {d.name}
                  </Link>
                  {d.region && <span className="text-stone text-xs ml-2">{d.region}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {!active && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-end justify-center pb-3 pointer-events-none md:hidden"
        >
          <span className="px-3 py-1.5 rounded-full bg-canvas/90 border border-hairline text-[11px] text-mute backdrop-blur-sm">
            Tap map to pan &amp; zoom
          </span>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
