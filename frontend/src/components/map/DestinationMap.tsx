"use client";
/**
 * Leaflet map of destination pins — Phase 4 W2.
 *
 * Loaded only through `MapPanel`, which wraps it in `next/dynamic` with
 * `ssr: false`. Leaflet touches `window` at module scope, so importing this
 * file during a server render throws; the dynamic boundary is what keeps that
 * from happening and is not incidental.
 *
 * Tiles, attribution and zoom limits come from `/api/maps/config` rather than
 * being hardcoded, so switching the provider to Mapbox is a backend
 * environment variable and needs no frontend deploy. The attribution is a
 * licence obligation for OSM tiles, which is why it is rendered from whatever
 * the API returns instead of being written here where it could be dropped.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

import { api } from "@/lib/api";
import type { DestinationPin, MapConfigOut } from "@/lib/api.types";

// Leaflet's default icon URLs are resolved relative to the CSS file, which
// breaks under a bundler. Pointing them at /public is the documented fix and
// keeps the images local — they load inside the Capacitor webview with no
// network, which a CDN would not.
const ICON = L.icon({
  iconUrl: "/marker-icon.png",
  iconRetinaUrl: "/marker-icon-2x.png",
  shadowUrl: "/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Bangalore. Used only when we have neither a rider home location nor any
// pins to fit — an empty map has to point somewhere.
const FALLBACK_CENTER: [number, number] = [12.9716, 77.5946];

type Props = {
  /** Rider's home, when known — centres the map somewhere meaningful. */
  origin?: [number, number] | null;
  /** Called when a pin is clicked. */
  onSelect?: (pin: DestinationPin) => void;
  className?: string;
};

export default function DestinationMap({ origin, onSelect, className }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);
  const [config, setConfig] = useState<MapConfigOut | null>(null);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Guards against a stale response from a pan the user has already
  // abandoned overwriting the pins for where they are now.
  const requestSeq = useRef(0);

  const loadPins = useCallback(async (map: L.Map) => {
    const seq = ++requestSeq.current;
    const b = map.getBounds();
    try {
      const res = await api.getMapPins({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
      if (seq !== requestSeq.current) return;

      setTruncated(res.truncated);
      const cluster = clusterRef.current;
      if (!cluster) return;
      cluster.clearLayers();
      for (const pin of res.pins) {
        const marker = L.marker([pin.latitude, pin.longitude], { icon: ICON });
        const rating =
          pin.rating_count > 0
            ? `${pin.avg_rating.toFixed(1)} ★ (${pin.rating_count})`
            : "Not yet rated";
        marker.bindPopup(
          `<div style="font-family:inherit">
             <strong>${escapeHtml(pin.name)}</strong><br/>
             <span style="opacity:.7">${rating}</span>
           </div>`
        );
        if (onSelect) marker.on("click", () => onSelect(pin));
        cluster.addLayer(marker);
      }
    } catch (err) {
      if (seq === requestSeq.current) {
        setError(err instanceof Error ? err.message : "Could not load pins");
      }
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    api
      .getMapConfig()
      .then((c) => !cancelled && setConfig(c))
      .catch(() =>
        !cancelled && setError("Map configuration is unavailable right now")
      );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!config || !containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: origin ?? FALLBACK_CENTER,
      zoom: origin ? 9 : 7,
      // Rydr's map is a browsing surface inside a scrolling page. Wheel zoom
      // would hijack the page scroll on desktop, so it is off and the +/-
      // control stays.
      scrollWheelZoom: false,
    });

    L.tileLayer(config.tile_url, {
      attribution: config.attribution,
      maxZoom: config.max_zoom,
      // OSM's tile URL template uses {s} for its subdomains.
      subdomains: config.tile_url.includes("{s}") ? ["a", "b", "c"] : [],
    }).addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 48,
    });
    map.addLayer(cluster);

    mapRef.current = map;
    clusterRef.current = cluster;

    void loadPins(map);
    // Refetch on pan/zoom so the pins match the viewport. `moveend` covers
    // both, and Leaflet debounces it to the end of the gesture.
    map.on("moveend", () => void loadPins(map));

    return () => {
      map.remove();
      mapRef.current = null;
      clusterRef.current = null;
    };
  }, [config, origin, loadPins]);

  const status = useMemo(() => {
    if (error) return error;
    if (loading) return "Loading destinations…";
    if (truncated) return "Showing the most-rated destinations here — zoom in for more";
    return null;
  }, [error, loading, truncated]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="w-full h-[420px] sm:h-[520px] rounded-lg overflow-hidden border border-hairline bg-surface-card"
        // Leaflet needs a real height on its container before it can compute
        // tile layout; a Tailwind class alone is fine, but an explicit style
        // guards against a parent that collapses.
        style={{ minHeight: 320 }}
      />
      {status && (
        <p className="mt-2 text-[12px] text-mute" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

/** Popups take an HTML string, so pin names must be escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
