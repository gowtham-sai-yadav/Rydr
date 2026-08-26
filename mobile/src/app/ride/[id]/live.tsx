import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import * as Location from "expo-location";
import { api } from "@/lib/api";
import { liveRideWsUrl } from "@/lib/ws";
import { startBackgroundTracking, stopBackgroundTracking } from "@/lib/backgroundLocation";
import { HazardReportOut, HazardType, RidePlanOut, RouteOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

interface RiderPosition {
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  speed_kmh: number | null;
  ts: string;
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

// Leaflet needs a DOM, which React Native doesn't have - it runs inside a
// WebView instead, loaded from CDN (the device has real network access
// here, unlike a sandboxed artifact preview) so no bundling step is
// needed. The RN side and the page talk over the WebView message bridge:
// RN -> page via `postMessage` (received as a `message` event on window/
// document - both are wired since Android and iOS differ on which fires),
// page -> RN via `window.ReactNativeWebView.postMessage`.
function buildMapHtml(destination: { name: string; latitude: number; longitude: number }): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: ${RydrColors.surfaceElevated}; }
    .rider-pin { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: ${RydrColors.onGold}; border: 2px solid ${RydrColors.canvas}; }
    .hazard-pin { font-size: 20px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: false }).setView([${destination.latitude}, ${destination.longitude}], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.marker([${destination.latitude}, ${destination.longitude}])
      .addTo(map)
      .bindPopup(${JSON.stringify(destination.name)} + ' (destination)');

    const riderMarkers = {};
    let myPolyline = null;
    const hazardMarkers = [];
    const routeMarkers = [];
    let routeLine = null;
    let fitted = false;

    function updateRiders(riders, myId, tracks) {
      Object.values(riders).forEach((r) => {
        const isMe = r.user_id === myId;
        const existing = riderMarkers[r.user_id];
        if (existing) {
          existing.setLatLng([r.lat, r.lng]);
        } else {
          const icon = L.divIcon({
            className: '',
            html: '<div class="rider-pin" style="width:' + (isMe ? 30 : 26) + 'px;height:' + (isMe ? 30 : 26) + 'px;background:' + r.color + '">' + r.initial + '</div>',
            iconSize: [isMe ? 30 : 26, isMe ? 30 : 26],
          });
          const marker = L.marker([r.lat, r.lng], { icon, zIndexOffset: isMe ? 1000 : 0 })
            .addTo(map)
            .bindPopup('<strong>' + r.name + (isMe ? ' (you)' : '') + '</strong>');
          riderMarkers[r.user_id] = marker;
        }
      });
      const myTrack = tracks[myId];
      if (myTrack && myTrack.length >= 2) {
        if (myPolyline) myPolyline.setLatLngs(myTrack);
        else myPolyline = L.polyline(myTrack, { color: riders[myId] ? riders[myId].color : '${RydrColors.gold}', weight: 3, opacity: 0.7 }).addTo(map);
      }
    }

    function updateHazards(hazards) {
      hazardMarkers.forEach((m) => m.remove());
      hazardMarkers.length = 0;
      hazards.forEach((h) => {
        const marker = L.marker([h.latitude, h.longitude], {
          icon: L.divIcon({ className: '', html: '<div class="hazard-pin">' + h.emoji + '</div>', iconSize: [24, 24] }),
        })
          .addTo(map)
          .bindPopup('<strong>' + h.label + '</strong>' + (h.description ? '<br/>' + h.description : ''));
        hazardMarkers.push(marker);
      });
    }

    function updateRoute(points) {
      routeMarkers.forEach((m) => m.remove());
      routeMarkers.length = 0;
      if (routeLine) { routeLine.remove(); routeLine = null; }
      if (!points || points.length === 0) return;
      points.forEach((p, i) => {
        const label = i === 0 ? String(1) : String(i + 1);
        const marker = L.marker([p.latitude, p.longitude], {
          icon: L.divIcon({
            className: '',
            html: '<div style="width:22px;height:22px;border-radius:50%;background:${RydrColors.gold};color:${RydrColors.onGold};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid ${RydrColors.canvas};">' + label + '</div>',
            iconSize: [22, 22],
          }),
        })
          .addTo(map)
          .bindPopup(p.label || ('Stop ' + (i + 1)));
        routeMarkers.push(marker);
      });
      routeLine = L.polyline(points.map((p) => [p.latitude, p.longitude]), { color: '${RydrColors.gold}', weight: 3, opacity: 0.6, dashArray: '6 8' }).addTo(map);
      if (!fitted) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude])), { padding: [40, 40] });
        fitted = true;
      }
    }

    function handleMessage(raw) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'riders') updateRiders(msg.riders, msg.myId, msg.tracks);
        else if (msg.type === 'hazards') updateHazards(msg.hazards);
        else if (msg.type === 'route') updateRoute(msg.points);
      } catch (e) {}
    }
    document.addEventListener('message', (e) => handleMessage(e.data));
    window.addEventListener('message', (e) => handleMessage(e.data));
  </script>
</body>
</html>`;
}

export default function LiveRideScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const webViewRef = useRef<WebView>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSentAtRef = useRef(0);
  const watchSubRef = useRef<Location.LocationSubscription | null>(null);

  const [ride, setRide] = useState<RidePlanOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsLive, setWsLive] = useState(false);
  const [backgroundActive, setBackgroundActive] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [riders, setRiders] = useState<Record<string, RiderPosition>>({});
  const tracksRef = useRef<Record<string, [number, number][]>>({});
  const [hazards, setHazards] = useState<HazardReportOut[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<HazardType>("police_check");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);

  const html = useMemo(() => (ride?.destination ? buildMapHtml(ride.destination) : ""), [ride?.destination]);

  const postToMap = useCallback((payload: unknown) => {
    webViewRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  const applyPosition = useCallback(
    (pos: RiderPosition) => {
      setRiders((prev) => {
        const next = { ...prev, [pos.user_id]: pos };
        const existing = tracksRef.current[pos.user_id] || [];
        const last = existing[existing.length - 1];
        if (!last || last[0] !== pos.lat || last[1] !== pos.lng) {
          tracksRef.current = { ...tracksRef.current, [pos.user_id]: [...existing, [pos.lat, pos.lng]] };
        }
        const colored: Record<string, RiderPosition & { color: string; initial: string }> = {};
        Object.values(next).forEach((r) => {
          colored[r.user_id] = { ...r, color: riderColor(r.user_id), initial: r.name.charAt(0).toUpperCase() };
        });
        postToMap({ type: "riders", riders: colored, myId: user?.id, tracks: tracksRef.current });
        return next;
      });
    },
    [postToMap, user?.id],
  );

  // Load ride + route + hazards.
  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const r = await api.getRide(id);
        setRide(r);
        if (r.destination) {
          api
            .listHazards({ nearLat: r.destination.latitude, nearLng: r.destination.longitude, radiusKm: 30 })
            .then((res) => setHazards(res.hazards))
            .catch(() => {});
        }
        if (r.route_id) {
          api
            .getRoute(r.route_id)
            .then((route: RouteOut) => {
              const points = [...route.points].sort((a, b) => a.ordinal - b.ordinal);
              postToMap({ type: "route", points });
            })
            .catch(() => {});
        }
      } catch {
        // leave ride null; screen shows a fallback state
      } finally {
        setLoading(false);
      }
    })();
  }, [id, postToMap]);

  useEffect(() => {
    if (hazards.length === 0) return;
    postToMap({
      type: "hazards",
      hazards: hazards.map((h) => ({
        latitude: h.latitude,
        longitude: h.longitude,
        label: HAZARD_TYPES.find((t) => t.value === h.hazard_type)?.label ?? "Hazard",
        emoji: HAZARD_TYPES.find((t) => t.value === h.hazard_type)?.emoji ?? "❗",
        description: h.description,
      })),
    });
  }, [hazards, postToMap]);

  // WebSocket + GPS stream.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      const url = await liveRideWsUrl(id);
      if (cancelled) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => setWsLive(true);
      ws.onclose = () => setWsLive(false);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "location") applyPosition(data as RiderPosition);
          else if (data.type === "snapshot" && Array.isArray(data.riders)) {
            (data.riders as RiderPosition[]).forEach(applyPosition);
          }
        } catch {
          // ignore malformed frames
        }
      };
    })();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationError("Location permission denied — enable it in system settings to share your position.");
        return;
      }
      watchSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          const speedKmh = speed != null && speed >= 0 ? speed * 3.6 : null;
          if (user) {
            applyPosition({ user_id: user.id, name: user.name, lat: latitude, lng: longitude, speed_kmh: speedKmh, ts: new Date().toISOString() });
          }
          const now = Date.now();
          if (now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS && wsRef.current?.readyState === WebSocket.OPEN) {
            lastSentAtRef.current = now;
            wsRef.current.send(JSON.stringify({ lat: latitude, lng: longitude, speed_kmh: speedKmh }));
          }
          setLocationError("");
        },
      );

      // Foreground tracking above keeps working regardless; this just
      // upgrades to also posting while backgrounded, via the REST twin
      // of the WS message (see lib/backgroundLocation.ts). A declined
      // "always" permission prompt just means no background upgrade —
      // not a failure of live tracking itself.
      const gotBackground = await startBackgroundTracking(id);
      setBackgroundActive(gotBackground);
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
      watchSubRef.current?.remove();
      watchSubRef.current = null;
      stopBackgroundTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const submitHazard = async () => {
    if (!ride?.destination) return;
    const me = riders[user?.id ?? ""];
    const lat = me?.lat ?? ride.destination.latitude;
    const lng = me?.lng ?? ride.destination.longitude;
    setReporting(true);
    try {
      const created = await api.reportHazard({ latitude: lat, longitude: lng, hazard_type: reportType, description: reportNote || null });
      setHazards((prev) => [created, ...prev]);
      setReportOpen(false);
      setReportNote("");
    } catch {
      // best-effort UI, leaves form open to retry
    } finally {
      setReporting(false);
    }
  };

  const leaderboard = Object.values(riders)
    .map((r) => ({ ...r, distanceKm: trackDistanceKm(tracksRef.current[r.user_id] || []) }))
    .sort((a, b) => b.distanceKm - a.distanceKm);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!ride?.destination) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load this ride&apos;s live map.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Live Ride", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />

      <View style={styles.statusRow}>
        <View style={styles.statusLeft}>
          <View style={[styles.statusDot, { backgroundColor: wsLive ? RydrColors.green : RydrColors.red }]} />
          <Text style={styles.statusText}>{wsLive ? "Live" : "Connecting…"}</Text>
          {backgroundActive && (
            <View style={styles.bgBadge}>
              <Ionicons name="shield-checkmark" size={11} color={RydrColors.gold} />
              <Text style={styles.bgBadgeText}>Background on</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.reportButton} onPress={() => setReportOpen((v) => !v)}>
          <Ionicons name="warning-outline" size={14} color={RydrColors.gold} />
          <Text style={styles.reportButtonText}>Report hazard</Text>
        </TouchableOpacity>
      </View>

      {!!locationError && <Text style={styles.locationError}>{locationError}</Text>}

      {reportOpen && (
        <View style={styles.reportPanel}>
          <View style={styles.hazardTypeRow}>
            {HAZARD_TYPES.map((t) => (
              <TouchableOpacity
                key={t.value}
                style={[styles.hazardChip, reportType === t.value && styles.hazardChipActive]}
                onPress={() => setReportType(t.value)}
              >
                <Text style={styles.hazardChipEmoji}>{t.emoji}</Text>
                <Text style={[styles.hazardChipText, reportType === t.value && styles.hazardChipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.reportInput}
            value={reportNote}
            onChangeText={setReportNote}
            placeholder="Add a note (optional)"
            placeholderTextColor={RydrColors.mute}
          />
          <TouchableOpacity style={[styles.submitReportButton, reporting && styles.submitReportButtonDisabled]} onPress={submitHazard} disabled={reporting}>
            <Text style={styles.submitReportButtonText}>{reporting ? "Reporting..." : "Submit report"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mapContainer}>
        {!!html && (
          <WebView
            ref={webViewRef}
            source={{ html }}
            style={styles.map}
            javaScriptEnabled
            onMessage={() => {}}
          />
        )}
      </View>

      {leaderboard.length > 0 && (
        <ScrollView style={styles.leaderboard} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leaderboardContent}>
          {leaderboard.map((r, i) => (
            <View key={r.user_id} style={styles.leaderCard}>
              <Text style={styles.leaderRank}>{i === 0 ? "🏆" : `#${i + 1}`}</Text>
              <Text style={styles.leaderName} numberOfLines={1}>{r.name}{r.user_id === user?.id ? " (you)" : ""}</Text>
              <Text style={styles.leaderDistance}>{r.distanceKm.toFixed(1)} km</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function riderColor(userId: string): string {
  const colors = ["#f59e0b", "#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#06b6d4", "#ec4899", "#84cc16"];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length];
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  errorText: { color: RydrColors.mute, fontSize: 14 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10 },
  statusLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: RydrColors.mute, fontSize: 12 },
  bgBadge: { flexDirection: "row", alignItems: "center", gap: 3, marginLeft: 6, backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  bgBadgeText: { color: RydrColors.gold, fontSize: 10, fontWeight: "600" },
  reportButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  reportButtonText: { color: RydrColors.gold, fontSize: 12, fontWeight: "600" },
  locationError: { color: RydrColors.red, fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 },
  reportPanel: { paddingHorizontal: 16, paddingBottom: 12, gap: 10 },
  hazardTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hazardChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  hazardChipActive: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  hazardChipEmoji: { fontSize: 12 },
  hazardChipText: { color: RydrColors.mute, fontSize: 11 },
  hazardChipTextActive: { color: RydrColors.onGold, fontWeight: "700" },
  reportInput: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: RydrColors.ink, fontSize: 13 },
  submitReportButton: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  submitReportButtonDisabled: { opacity: 0.6 },
  submitReportButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  mapContainer: { flex: 1 },
  map: { flex: 1, backgroundColor: RydrColors.surfaceDeep },
  leaderboard: { maxHeight: 76, borderTopWidth: 1, borderTopColor: RydrColors.hairline },
  leaderboardContent: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  leaderCard: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 100 },
  leaderRank: { fontSize: 12 },
  leaderName: { color: RydrColors.ink, fontSize: 12, fontWeight: "600", marginTop: 2 },
  leaderDistance: { color: RydrColors.gold, fontSize: 11, fontWeight: "700", marginTop: 2 },
});
