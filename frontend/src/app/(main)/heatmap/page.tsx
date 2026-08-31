"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

type Mode = "mine" | "global";

// No leaflet.heat dependency — a dense scatter of small, low-opacity,
// overlapping circle markers reads as a heatmap once there's enough of
// them, without adding a plugin for what's otherwise a one-page feature.
export default function HeatmapPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("mine");
  const [rideCount, setRideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [20.5937, 78.9629], zoom: 5 });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!user && mode === "mine") return;
    setLoading(true);
    setError("");
    const request = mode === "mine" ? api.getUserHeatmap(user!.id) : api.getGlobalHeatmap();
    request
      .then((res) => {
        setRideCount(res.ride_count);
        const layer = layerRef.current;
        const map = mapRef.current;
        if (!layer || !map) return;
        layer.clearLayers();
        res.points.forEach(([lat, lng]) => {
          L.circleMarker([lat, lng], {
            radius: 6,
            color: "transparent",
            fillColor: "#f59e0b",
            fillOpacity: 0.12,
          }).addTo(layer);
        });
        if (res.points.length > 0) {
          const bounds = L.latLngBounds(res.points.map(([lat, lng]) => [lat, lng] as [number, number]));
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load heatmap"))
      .finally(() => setLoading(false));
  }, [mode, user]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-ink uppercase">
          Ridden Ground
        </h1>
        <div className="flex gap-1.5 bg-surface-card/40 border border-hairline-strong p-1 rounded-xl">
          <button
            onClick={() => setMode("mine")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider ${
              mode === "mine" ? "bg-accent-gold text-canvas" : "text-mute hover:text-ink"
            }`}
          >
            My Rides
          </button>
          <button
            onClick={() => setMode("global")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider ${
              mode === "global" ? "bg-accent-gold text-canvas" : "text-mute hover:text-ink"
            }`}
          >
            Everyone
          </button>
        </div>
      </div>

      {error && <p className="text-accent-red text-sm">{error}</p>}
      {!loading && <p className="text-mute text-xs">Drawn from {rideCount} tracked ride{rideCount === 1 ? "" : "s"}.</p>}

      <div className="rounded-2xl overflow-hidden border border-hairline-strong shadow-2xl relative">
        <div ref={containerRef} style={{ height: 520 }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/60">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-ink/20 border-t-ink" />
          </div>
        )}
      </div>
    </div>
  );
}
