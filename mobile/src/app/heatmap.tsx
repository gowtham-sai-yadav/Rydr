import { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useFocusEffect } from "expo-router";
import { WebView } from "react-native-webview";
import { useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

type Mode = "mine" | "global";

// No leaflet.heat dependency, same as the web page — a dense scatter of
// small, low-opacity, overlapping circle markers reads as a heatmap once
// there's enough of them.
const MAP_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>html, body, #map { height: 100%; margin: 0; padding: 0; background: ${RydrColors.surfaceElevated}; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const map = L.map('map', { zoomControl: false }).setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const layer = L.layerGroup().addTo(map);

    function render(points) {
      layer.clearLayers();
      points.forEach(([lat, lng]) => {
        L.circleMarker([lat, lng], { radius: 6, color: 'transparent', fillColor: '${RydrColors.gold}', fillOpacity: 0.12 }).addTo(layer);
      });
      if (points.length > 0) {
        map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 12 });
      }
    }
    function handleMessage(raw) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === 'points') render(msg.points);
      } catch (e) {}
    }
    document.addEventListener('message', (e) => handleMessage(e.data));
    window.addEventListener('message', (e) => handleMessage(e.data));
  </script>
</body>
</html>`;

export default function HeatmapScreen() {
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>("mine");
  const [rideCount, setRideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const webViewRef = useRef<WebView>(null);

  const load = useCallback(
    (m: Mode) => {
      setLoading(true);
      setError("");
      const request = m === "mine" && user ? api.getUserHeatmap(user.id) : api.getGlobalHeatmap();
      request
        .then((res) => {
          setRideCount(res.ride_count);
          webViewRef.current?.postMessage(JSON.stringify({ type: "points", points: res.points }));
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Failed to load heatmap"))
        .finally(() => setLoading(false));
    },
    [user],
  );

  useFocusEffect(
    useCallback(() => {
      load(mode);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]),
  );

  const html = useMemo(() => MAP_HTML, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Ridden Ground", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />

      <View style={styles.segment}>
        <TouchableOpacity style={[styles.segmentItem, mode === "mine" && styles.segmentItemActive]} onPress={() => setMode("mine")}>
          <Text style={[styles.segmentText, mode === "mine" && styles.segmentTextActive]}>My Rides</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentItem, mode === "global" && styles.segmentItemActive]} onPress={() => setMode("global")}>
          <Text style={[styles.segmentText, mode === "global" && styles.segmentTextActive]}>Everyone</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {!loading && <Text style={styles.meta}>Drawn from {rideCount} tracked ride{rideCount === 1 ? "" : "s"}.</Text>}

      <View style={styles.mapContainer}>
        <WebView ref={webViewRef} source={{ html }} style={styles.map} javaScriptEnabled onMessage={() => {}} />
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={RydrColors.gold} />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  segment: { flexDirection: "row", marginHorizontal: 16, marginTop: 12, marginBottom: 8, backgroundColor: RydrColors.surfaceCard, borderRadius: 10, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentItemActive: { backgroundColor: RydrColors.hairline },
  segmentText: { color: RydrColors.mute, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: RydrColors.ink },
  errorText: { color: RydrColors.red, fontSize: 12, paddingHorizontal: 16 },
  meta: { color: RydrColors.mute, fontSize: 11, paddingHorizontal: 16, paddingBottom: 8 },
  mapContainer: { flex: 1 },
  map: { flex: 1, backgroundColor: RydrColors.surfaceDeep },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(7,7,9,0.5)" },
});
