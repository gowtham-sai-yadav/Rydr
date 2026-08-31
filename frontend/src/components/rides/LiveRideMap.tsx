"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { liveRideWsUrl } from "@/lib/ws";
import { goldPinIcon, hazardIcon, numberedGoldIcon, returnLegIcon, riderColor, riderIcon, stopIcon } from "@/lib/leafletIcons";
import type { HazardReportOut, HazardType, RouteOut } from "@/lib/api.types";

interface RiderPosition {
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  ts: string;
}

interface LiveRideMapProps {
  rideId: string;
  destination: { name: string; latitude: number; longitude: number };
  /** The ride's planned route, if one was attached at creation — drawn as
   * a dashed gold line with numbered pins; the live traveled path (solid,
   * per-rider colour) draws over it as riders actually cover it. */
  routeId?: string | null;
}

const MIN_SEND_INTERVAL_MS = 4000;
const EARTH_RADIUS_KM = 6371;

function haversineKm(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

function trackDistanceKm(track: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < track.length; i++) total += haversineKm(track[i - 1], track[i]);
  return total;
}

const HAZARD_TYPES: { value: HazardType; label: string; emoji: string }[] = [
  { value: "police_check", label: "Police check", emoji: "🚨" },
  { value: "pothole", label: "Pothole", emoji: "🕳️" },
  { value: "gravel", label: "Gravel/loose", emoji: "🪨" },
  { value: "animal_crossing", label: "Animal crossing", emoji: "🐾" },
  { value: "accident", label: "Accident", emoji: "⚠️" },
  { value: "waterlogging", label: "Waterlogged", emoji: "💧" },
  { value: "other", label: "Other", emoji: "❗" },
];

/** Live map for an in-progress group ride: everyone approved shares their
 * browser-GPS position over a WebSocket (foreground only - no native
 * background tracking exists since the Android wrap hasn't happened),
 * shown as moving pins plus each rider's distance-covered-so-far ranking,
 * with community hazard pins layered on top and a one-tap report flow. */
export function LiveRideMap({ rideId, destination, routeId }: LiveRideMapProps) {
  const { user } = useAuth();
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const hazardMarkersRef = useRef<L.Marker[]>([]);
  const routeMarkersRef = useRef<L.Marker[]>([]);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const myPolylineRef = useRef<L.Polyline | null>(null);
  const [plannedRoute, setPlannedRoute] = useState<RouteOut | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);

  const [riders, setRiders] = useState<Record<string, RiderPosition>>({});
  const [tracks, setTracks] = useState<Record<string, [number, number][]>>({});
  const [hazards, setHazards] = useState<HazardReportOut[]>([]);
  const [locationError, setLocationError] = useState("");
  const [wsLive, setWsLive] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<HazardType>("police_check");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);

  const applyPosition = useCallback((pos: RiderPosition) => {
    setRiders((prev) => ({ ...prev, [pos.user_id]: pos }));
    setTracks((prev) => {
      const existing = prev[pos.user_id] || [];
      const last = existing[existing.length - 1];
      if (last && last[0] === pos.lat && last[1] === pos.lng) return prev;
      return { ...prev, [pos.user_id]: [...existing, [pos.lat, pos.lng]] };
    });
  }, []);

  // Planned route (if one was attached to this ride at creation).
  useEffect(() => {
    if (!routeId) return;
    api
      .getRoute(routeId)
      .then(setPlannedRoute)
      .catch(() => {
        // Non-blocking - the map still works with just live positions.
      });
  }, [routeId]);

  // Hazards near the destination, loaded once - a live ride happens in one
  // area, no need to re-query as riders move a few km around it.
  useEffect(() => {
    api
      .listHazards({ nearLat: destination.latitude, nearLng: destination.longitude, radiusKm: 30 })
      .then((res) => setHazards(res.hazards))
      .catch(() => {
        // Non-blocking - the map still works without hazard pins.
      });
  }, [destination.latitude, destination.longitude]);

  // WebSocket connection + outgoing position stream.
  useEffect(() => {
    const ws = new WebSocket(liveRideWsUrl(rideId));
    wsRef.current = ws;

    ws.onopen = () => setWsLive(true);
    ws.onclose = () => setWsLive(false);
    ws.onerror = () => {};
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "location") {
          applyPosition(data as RiderPosition);
        } else if (data.type === "snapshot" && Array.isArray(data.riders)) {
          (data.riders as RiderPosition[]).forEach(applyPosition);
        }
      } catch {
        // Ignore malformed frames.
      }
    };

    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
          if (user) {
            applyPosition({
              user_id: user.id,
              name: user.name,
              lat: latitude,
              lng: longitude,
              speed_kmh: speedKmh,
              ts: new Date().toISOString(),
            });
          }
          const now = Date.now();
          if (now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS && ws.readyState === WebSocket.OPEN) {
            lastSentAtRef.current = now;
            ws.send(JSON.stringify({ lat: latitude, lng: longitude, speed_kmh: speedKmh }));
          }
          setLocationError("");
        },
        (err) => setLocationError(err.message || "Couldn't get your location"),
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    } else {
      setLocationError("This browser doesn't support location sharing");
    }

    return () => {
      ws.close();
      wsRef.current = null;
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  // Map init.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [destination.latitude, destination.longitude],
      zoom: 12,
    });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    L.marker([destination.latitude, destination.longitude], { icon: goldPinIcon() })
      .addTo(map)
      .bindPopup(`<strong>${destination.name}</strong> (destination)`);

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rider markers - update in place rather than recreate, so a marker
  // doesn't flicker/reset its popup state on every position tick.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(riders).forEach((r) => {
      const isMe = r.user_id === user?.id;
      const color = riderColor(r.user_id);
      const initial = r.name.charAt(0).toUpperCase();
      const existing = markersRef.current[r.user_id];
      if (existing) {
        existing.setLatLng([r.lat, r.lng]);
      } else {
        const marker = L.marker([r.lat, r.lng], { icon: riderIcon(initial, color, isMe), zIndexOffset: isMe ? 1000 : 0 })
          .addTo(map)
          .bindPopup(`<strong>${r.name}${isMe ? " (you)" : ""}</strong>`);
        markersRef.current[r.user_id] = marker;
      }
    });
  }, [riders, user?.id]);

  // My own traveled path.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !user) return;
    const myTrack = tracks[user.id];
    if (!myTrack || myTrack.length < 2) return;
    if (myPolylineRef.current) {
      myPolylineRef.current.setLatLngs(myTrack);
    } else {
      myPolylineRef.current = L.polyline(myTrack, { color: riderColor(user.id), weight: 3, opacity: 0.7 }).addTo(map);
    }
  }, [tracks, user]);

  // Hazard pins - static per hazards fetch, rebuilt on change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    hazardMarkersRef.current.forEach((m) => m.remove());
    hazardMarkersRef.current = hazards.map((h) => {
      const label = HAZARD_TYPES.find((t) => t.value === h.hazard_type)?.label || "Hazard";
      return L.marker([h.latitude, h.longitude], { icon: hazardIcon(h.hazard_type) })
        .addTo(map)
        .bindPopup(
          `<strong>${label}</strong>${h.description ? `<br/>${h.description}` : ""}<br/><span style="opacity:0.6;font-size:11px">reported by ${h.reporter?.name || "a rider"}</span>`,
        );
    });
  }, [hazards]);

  // Planned route - dashed gold line + numbered pins (start/stops/
  // destination, and the return leg if the planner set one). Drawn once
  // per route load; the live traveled-path polyline (per rider, solid)
  // draws on top as riders actually cover ground, which is the "turns
  // real" effect over the dashed plan.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plannedRoute) return;
    routeMarkersRef.current.forEach((m) => m.remove());
    routeLineRef.current?.remove();

    const points = [...plannedRoute.points].sort((a, b) => a.ordinal - b.ordinal);
    routeMarkersRef.current = points.map((p, i) => {
      const isReturn = i === points.length - 1 && i > 0 && p.latitude === points[0].latitude && p.longitude === points[0].longitude;
      const icon = isReturn ? returnLegIcon() : p.is_stop ? stopIcon(i + 1) : numberedGoldIcon(i + 1);
      return L.marker([p.latitude, p.longitude], { icon })
        .addTo(map)
        .bindPopup(p.label || (i === 0 ? "Start" : isReturn ? "Return to start" : `Stop ${i + 1}`));
    });
    routeLineRef.current = L.polyline(
      points.map((p) => [p.latitude, p.longitude]),
      { color: "#e5b80b", weight: 3, opacity: 0.6, dashArray: "6 8" },
    ).addTo(map);

    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [40, 40] });
    }
  }, [plannedRoute]);

  const submitHazard = async () => {
    const me = riders[user?.id || ""];
    const lat = me?.lat ?? destination.latitude;
    const lng = me?.lng ?? destination.longitude;
    setReporting(true);
    try {
      const created = await api.reportHazard({
        latitude: lat,
        longitude: lng,
        hazard_type: reportType,
        description: reportNote || null,
      });
      setHazards((prev) => [created, ...prev]);
      setReportOpen(false);
      setReportNote("");
    } catch {
      // Best-effort UI, error just leaves the form open to retry.
    } finally {
      setReporting(false);
    }
  };

  const leaderboard = Object.values(riders)
    .map((r) => ({ ...r, distanceKm: trackDistanceKm(tracks[r.user_id] || []) }))
    .sort((a, b) => b.distanceKm - a.distanceKm);

  return (
    <div className="card-bordered p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider">Live Ride</h2>
        <span className="flex items-center gap-1.5 text-xs text-mute">
          <span className={`status-dot ${wsLive ? "bg-accent-green" : "bg-accent-red"}`} />
          {wsLive ? "Live" : "Connecting…"}
        </span>
      </div>

      {locationError && (
        <p className="text-accent-red text-xs">
          {locationError} — enable location access to share your position and see others.
        </p>
      )}

      <div ref={containerRef} className="rounded-xl overflow-hidden" style={{ height: 340 }} />

      {leaderboard.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-mute uppercase tracking-wider font-semibold">Leading this ride</p>
          {leaderboard.map((r, i) => (
            <div key={r.user_id} className="flex items-center gap-2 text-sm">
              <span className="mono text-mute w-4 text-right shrink-0">{i + 1}</span>
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: riderColor(r.user_id) }}
              />
              <span className="flex-1 text-ink truncate">
                {r.name}
                {r.user_id === user?.id && <span className="text-mute"> (you)</span>}
              </span>
              <span className="mono text-xs text-mute shrink-0">{r.distanceKm.toFixed(1)} km</span>
            </div>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-hairline">
        {reportOpen ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {HAZARD_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setReportType(t.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[10px] font-medium transition-colors ${
                    reportType === t.value
                      ? "border-accent-red bg-accent-red/10 text-ink"
                      : "border-hairline-strong text-mute hover:text-ink"
                  }`}
                >
                  <span className="text-lg">{t.emoji}</span>
                  {t.label}
                </button>
              ))}
            </div>
            <input
              value={reportNote}
              onChange={(e) => setReportNote(e.target.value)}
              placeholder="Optional note…"
              maxLength={500}
              className="w-full bg-surface-card border border-hairline-strong rounded-lg px-3 py-2 text-sm text-ink placeholder:text-stone focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={submitHazard}
                disabled={reporting}
                className="flex-1 bg-accent-red text-ink hover:bg-accent-red/90 disabled:opacity-50 py-2 rounded-lg text-xs font-bold uppercase tracking-wider"
              >
                {reporting ? "Reporting…" : "Report at my location"}
              </button>
              <button
                onClick={() => setReportOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-mute hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setReportOpen(true)}
            className="w-full bg-surface-elevated hover:bg-surface-elevated text-ink py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            🚨 Report a hazard
          </button>
        )}
      </div>
    </div>
  );
}
