"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { goldPinIcon } from "@/lib/leafletIcons";

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
}

// Read-only browsing map - one pin per destination, click through to the
// detail page. Built on plain Leaflet + OpenStreetMap tiles, so it needs no
// API key or account. Falls back to a plain list only if the map library
// fails to initialize (e.g. an SSR mismatch).
export default function DestinationMap({
  destinations,
  height = 360,
  className = "",
}: DestinationMapProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current || destinations.length === 0) return;

    try {
      const map = L.map(containerRef.current, {
        center: [destinations[0].latitude, destinations[0].longitude],
        zoom: 8,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const markers: L.Marker[] = [];
      destinations.forEach((d) => {
        const marker = L.marker([d.latitude, d.longitude], { icon: goldPinIcon() })
          .addTo(map)
          .bindPopup(`<strong>${escapeHtml(d.name)}</strong>`);
        marker.on("click", () => router.push(`/destinations/${d.id}`));
        markers.push(marker);
      });

      if (destinations.length > 1) {
        const group = L.featureGroup(markers);
        map.fitBounds(group.getBounds(), { padding: [48, 48], maxZoom: 12 });
      }
    } catch {
      setFailed(true);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations]);

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
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden ${className}`}
      style={{ height }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
