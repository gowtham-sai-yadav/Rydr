"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { numberedGoldIcon, returnLegIcon, stopIcon } from "@/lib/leafletIcons";

function iconFor(wp: Waypoint, idx: number): L.DivIcon {
  if (wp.isReturnLeg) return returnLegIcon();
  if (wp.isStop) return stopIcon(idx + 1);
  return numberedGoldIcon(idx + 1);
}
import { api } from "@/lib/api";

export interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  isStop?: boolean;
  /** True for the auto-appended closing leg when "return to start" is on —
   * managed by the component, not directly editable/removable by the user. */
  isReturnLeg?: boolean;
}

interface JourneyPlannerProps {
  initialWaypoints?: Waypoint[];
  center?: [number, number]; // [lat, lng]
  /** Destination this journey belongs to — required to save/publish. */
  destinationId?: string;
  onSaved?: (routeId: string) => void;
}

let nextId = 1;
function makeId() {
  return `wp-${Date.now()}-${nextId++}`;
}

// Interactive route/waypoint editor built on plain Leaflet + OpenStreetMap
// tiles (no API key, no react-leaflet wrapper - a useRef/useEffect
// imperative integration, same shape as the read-only DestinationMap).
// Click the map to drop a waypoint, drag markers to reposition, and a gold
// polyline connects them in order. This draws a straight-line connector
// between waypoints rather than calling a routing service for a
// road-snapped path - that would be the natural next step but is out of
// scope here.
export default function JourneyPlanner({
  initialWaypoints = [],
  center = [12.9716, 77.5946], // Bengaluru, a reasonable default center
  destinationId,
  onSaved,
}: JourneyPlannerProps) {
  const [waypoints, setWaypoints] = useState<Waypoint[]>(initialWaypoints);
  const [returnToStart, setReturnToStart] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

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

  const toggleStop = (id: string) => {
    setWaypoints((prev) => prev.map((w) => (w.id === id ? { ...w, isStop: !w.isStop } : w)));
  };

  // Reordering excludes the auto-managed return leg — it's always last by
  // definition, so it never appears in the movable range.
  const moveWaypoint = (index: number, direction: -1 | 1) => {
    setWaypoints((prev) => {
      const editable = prev.filter((w) => !w.isReturnLeg);
      const target = index + direction;
      if (target < 0 || target >= editable.length) return prev;
      [editable[index], editable[target]] = [editable[target], editable[index]];
      const returnLeg = prev.find((w) => w.isReturnLeg);
      return returnLeg ? [...editable, returnLeg] : editable;
    });
  };

  // "Return to start": keeps a synthetic closing waypoint pinned to
  // waypoint[0]'s current position, so point A -> B -> C -> back to A
  // forms automatically and stays in sync as the real start point moves —
  // the user never edits this leg directly, just the checkbox.
  useEffect(() => {
    setWaypoints((prev) => {
      const real = prev.filter((w) => !w.isReturnLeg);
      if (!returnToStart || real.length === 0) {
        return real;
      }
      const origin = real[0];
      return [...real, { id: "return-leg", lat: origin.lat, lng: origin.lng, label: "Back to start", isReturnLeg: true }];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnToStart, waypoints[0]?.lat, waypoints[0]?.lng]);

  const handleSave = async (publish: boolean) => {
    if (!destinationId || waypoints.length < 2) return;
    setSaving(true);
    setSaveError("");
    try {
      const route = await api.createRoute({
        destination_id: destinationId,
        name: routeName || undefined,
        points: waypoints.map((w, i) => ({
          ordinal: i,
          latitude: w.lat,
          longitude: w.lng,
          label: w.label || (w.isReturnLeg ? "Back to start" : undefined),
          is_stop: !!w.isStop,
        })),
        publish,
      });
      setSavedRouteId(route.id);
      onSaved?.(route.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save route");
    } finally {
      setSaving(false);
    }
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
        marker = L.marker([wp.lat, wp.lng], { icon: iconFor(wp, idx), draggable: !wp.isReturnLeg }).addTo(map);
        marker.on("dragend", () => {
          const pos = marker!.getLatLng();
          updateWaypoint(wp.id, { lat: pos.lat, lng: pos.lng });
        });
        marker.on("click", () => focusWaypoint(wp.id));
        markersRef.current.set(wp.id, marker);
      } else {
        marker.setLatLng([wp.lat, wp.lng]);
        marker.setIcon(iconFor(wp, idx));
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

  const editableWaypoints = waypoints.filter((w) => !w.isReturnLeg);
  const returnLeg = waypoints.find((w) => w.isReturnLeg);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
      <div ref={containerRef} className="rounded-xl overflow-hidden h-[320px] sm:h-[420px] lg:h-[560px]" />

      <div className="bg-surface-card rounded-xl p-4 space-y-3 max-h-[560px] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Waypoints</h2>
          <span className="text-xs text-mute">Tap the map to add a stop</span>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink cursor-pointer select-none py-1">
          <input
            type="checkbox"
            checked={returnToStart}
            onChange={(e) => setReturnToStart(e.target.checked)}
            disabled={editableWaypoints.length === 0}
            className="rounded border-hairline-strong text-accent-gold focus:ring-accent-gold/30"
          />
          Return to starting point
        </label>

        {waypoints.length === 0 && (
          <p className="text-mute text-sm">No waypoints yet. Tap the map to drop your first pin — start, then each stop, then your destination.</p>
        )}

        <div className="space-y-3">
          {editableWaypoints.map((wp, idx) => (
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
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-gold text-canvas text-xs font-bold shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-[10px] text-stone uppercase tracking-wide">
                    {idx === 0 ? "Start" : idx === editableWaypoints.length - 1 && !returnToStart ? "Destination" : ""}
                  </span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveWaypoint(idx, -1)}
                    disabled={idx === 0}
                    className="text-mute hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 min-w-[32px]"
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveWaypoint(idx, 1)}
                    disabled={idx === editableWaypoints.length - 1}
                    className="text-mute hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed px-2 py-1 min-w-[32px]"
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeWaypoint(wp.id)}
                    className="text-accent-red hover:text-accent-red px-2 py-1 text-xs min-w-[44px]"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <input
                value={wp.label}
                onChange={(e) => updateWaypoint(wp.id, { label: e.target.value })}
                placeholder="Note - e.g. fuel stop, breakfast spot, scenic viewpoint"
                className="input text-sm py-1.5"
              />
              <div className="flex items-center justify-between mt-1.5">
                <label className="flex items-center gap-1.5 text-xs text-mute cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!wp.isStop}
                    onChange={() => toggleStop(wp.id)}
                    className="rounded border-hairline-strong text-accent-green focus:ring-accent-green/30"
                  />
                  Food / fuel / rest stop
                </label>
                <p className="text-[11px] text-stone">
                  {wp.lat.toFixed(4)}, {wp.lng.toFixed(4)}
                </p>
              </div>
            </div>
          ))}

          {returnLeg && (
            <div className="rounded-lg p-3 border border-dashed border-hairline-strong bg-surface-elevated/50 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone/60 text-canvas text-xs font-bold shrink-0">
                ↩
              </span>
              <p className="text-xs text-mute">Return to start (auto-added)</p>
            </div>
          )}
        </div>

        {destinationId && (
          <div className="pt-3 border-t border-hairline space-y-2">
            <input
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              placeholder="Name this route (optional)"
              className="input text-sm py-1.5 w-full"
            />
            {saveError && <p className="text-accent-red text-xs">{saveError}</p>}
            {savedRouteId ? (
              <p className="text-accent-green text-xs font-medium">✓ Route saved and attached</p>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleSave(false)}
                  disabled={saving || waypoints.length < 2}
                  className="flex-1 bg-surface-elevated hover:bg-surface-elevated disabled:opacity-50 text-ink py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  {saving ? "Saving…" : "Save route"}
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={saving || waypoints.length < 2}
                  className="flex-1 bg-accent-gold text-canvas hover:bg-accent-gold/90 disabled:opacity-50 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  Save &amp; publish
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
