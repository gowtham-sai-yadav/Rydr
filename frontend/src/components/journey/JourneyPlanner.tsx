"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { numberedGoldIcon } from "@/lib/leafletIcons";

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

interface JourneyPlannerProps {
  initialWaypoints?: Waypoint[];
  center?: [number, number]; // [lat, lng]
}

let nextId = 1;
function makeId() {
  return `wp-${Date.now()}-${nextId++}`;
}

// Interactive route/waypoint editor built on plain Leaflet + OpenStreetMap
// tiles (no API key, no react-leaflet wrapper — a useRef/useEffect
// imperative integration, same shape as the read-only DestinationMap).
// Click the map to drop a waypoint, drag markers to reposition, and a gold
// polyline connects them in order. This draws a straight-line connector
// between waypoints rather than calling a routing service for a
// road-snapped path — that would be the natural next step but is out of
// scope here.
export default function JourneyPlanner({
  initialWaypoints = [],
  center = [12.9716, 77.5946], // Bengaluru, a reasonable default center
}: JourneyPlannerProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(initialWaypoints);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const lineRef = useRef<L.Polyline | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const addWaypoint = (lat: number, lng: number) => {
    setWaypoints((prev) => [...prev, { id: makeId(), lat, lng, label: "" }]);
  };

  const removeWaypoint = (id: string) => {
    setWaypoints((prev) => prev.filter((w) => w.id !== id));
  };

  const updateWaypoint = (id: string, patch: Partial<Waypoint>) => {
    setWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  };

  const moveWaypoint = (index: number, direction: -1 | 1) => {
    setWaypoints((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const focusWaypoint = (id: string) => {
    setHighlightedId(id);
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, { center, zoom: 11 });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    lineRef.current = L.polyline([], { color: "#e5b80b", weight: 3, dashArray: "6 8" }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      addWaypoint(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep markers + connecting line in sync with waypoint state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    waypoints.forEach((wp, idx) => {
      seen.add(wp.id);
      let marker = markersRef.current.get(wp.id);
      if (!marker) {
        marker = L.marker([wp.lat, wp.lng], { icon: numberedGoldIcon(idx + 1), draggable: true }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker!.getLatLng();
          updateWaypoint(wp.id, { lat: pos.lat, lng: pos.lng });
        });
        marker.on("click", () => focusWaypoint(wp.id));
        markersRef.current.set(wp.id, marker);
      } else {
        marker.setLatLng([wp.lat, wp.lng]);
        marker.setIcon(numberedGoldIcon(idx + 1));
      }
    });

    markersRef.current.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    lineRef.current?.setLatLngs(waypoints.map((w) => [w.lat, w.lng]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypoints]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
      <div ref={containerRef} className="rounded-xl overflow-hidden h-[420px] lg:h-[560px]" />

      <div className="bg-surface-card rounded-xl p-4 space-y-3 max-h-[560px] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Waypoints</h2>
          <span className="text-xs text-mute">Click the map to add a stop</span>
        </div>

        {waypoints.length === 0 && (
          <p className="text-mute text-sm">No waypoints yet. Click the map to drop your first pin.</p>
        )}

        <div className="space-y-3">
          {waypoints.map((wp, idx) => (
            <div
              key={wp.id}
              ref={highlightedId === wp.id ? highlightRef : undefined}
              className={`rounded-lg p-3 border transition-colors ${
                highlightedId === wp.id
                  ? "border-accent-gold bg-accent-gold/5"
                  : "border-hairline-strong bg-surface-elevated"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-gold text-canvas text-xs font-bold">
                  {idx + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveWaypoint(idx, -1)}
                    disabled={idx === 0}
                    className="text-mute hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-1.5 py-0.5"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWaypoint(idx, 1)}
                    disabled={idx === waypoints.length - 1}
                    className="text-mute hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-1.5 py-0.5"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWaypoint(wp.id)}
                    className="text-accent-red hover:text-accent-red px-1.5 py-0.5 text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <input
                value={wp.label}
                onChange={(e) => updateWaypoint(wp.id, { label: e.target.value })}
                placeholder="Note — e.g. fuel stop, breakfast spot, scenic viewpoint"
                className="input text-sm py-1.5"
              />
              <p className="text-[11px] text-stone mt-1">
                {wp.lat.toFixed(5)}, {wp.lng.toFixed(5)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
