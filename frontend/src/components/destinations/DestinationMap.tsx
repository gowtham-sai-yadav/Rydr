"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DestinationSummary } from "@/lib/api.types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

type DestinationPin = Pick<
  DestinationSummary,
  "id" | "name" | "latitude" | "longitude" | "region"
>;

type Props = {
  destinations: DestinationPin[];
  /** Compact mode is used on the destination detail page's location panel. */
  compact?: boolean;
  className?: string;
};

/**
 * Renders a real Mapbox GL map with clustered markers when
 * NEXT_PUBLIC_MAPBOX_TOKEN is configured. With no token (this environment
 * has none), falls back to a styled list of pins with lat/lng shown so the
 * page never crashes or shows a broken map.
 */
export function DestinationMap({ destinations, compact, className }: Props) {
  if (!MAPBOX_TOKEN) {
    return (
      <FallbackPanel destinations={destinations} compact={compact} className={className} />
    );
  }
  return (
    <MapboxMap destinations={destinations} compact={compact} className={className} />
  );
}

function FallbackPanel({ destinations, compact, className }: Props) {
  return (
    <div
      className={`card-bordered ${compact ? "p-4" : "p-6"} ${className ?? ""}`}
    >
      <div className="flex items-start gap-3 mb-4">
        <svg className="w-5 h-5 text-stone shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
        </svg>
        <div>
          <p className="text-ink text-sm font-medium">Map unavailable</p>
          <p className="caption mt-0.5">
            Set NEXT_PUBLIC_MAPBOX_TOKEN to enable the interactive map.
          </p>
        </div>
      </div>
      {destinations.length === 0 ? (
        <p className="caption">No destinations to show.</p>
      ) : (
        <ul className={`grid ${compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"} gap-2`}>
          {destinations.map((d) => (
            <li key={d.id}>
              <Link
                href={`/destinations/${d.id}`}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-elevated/50 hover:bg-surface-elevated px-3 py-2 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-ink text-sm font-medium truncate">{d.name}</p>
                  {d.region && <p className="caption truncate">{d.region}</p>}
                </div>
                <span className="mono text-xs text-stone shrink-0">
                  {d.latitude.toFixed(2)}, {d.longitude.toFixed(2)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MapboxMap({ destinations, compact, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let markers: import("mapbox-gl").Marker[] = [];

    (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = MAPBOX_TOKEN;

        const first = destinations[0];
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/dark-v11",
          center: first ? [first.longitude, first.latitude] : [78.9629, 20.5937],
          zoom: destinations.length > 0 ? 5 : 3,
        });
        mapRef.current = map;
        map.addControl(new mapboxgl.NavigationControl(), "top-right");

        map.on("load", () => {
          if (cancelled) return;
          const bounds = new mapboxgl.LngLatBounds();
          markers = destinations.map((d) => {
            const el = document.createElement("a");
            el.href = `/destinations/${d.id}`;
            el.style.display = "block";
            el.style.width = "14px";
            el.style.height = "14px";
            el.style.borderRadius = "9999px";
            el.style.background = "#ff801f";
            el.style.border = "2px solid #fcfdff";
            el.style.cursor = "pointer";
            el.title = d.name;

            const marker = new mapboxgl.Marker({ element: el })
              .setLngLat([d.longitude, d.latitude])
              .setPopup(new mapboxgl.Popup({ offset: 12 }).setText(d.name))
              .addTo(map);
            bounds.extend([d.longitude, d.latitude]);
            return marker;
          });
          if (destinations.length > 1) {
            map.fitBounds(bounds, { padding: 48, maxZoom: 10 });
          }
        });

        map.on("error", () => {
          if (!cancelled) setFailed(true);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      markers.forEach((m) => m.remove());
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations]);

  if (failed) {
    return <FallbackPanel destinations={destinations} compact={compact} className={className} />;
  }

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-xl overflow-hidden bg-surface-card ${compact ? "h-48" : "h-96"} ${className ?? ""}`}
    />
  );
}
