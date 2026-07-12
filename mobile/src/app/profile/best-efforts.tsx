import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { BestEffortOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function BestEffortsScreen() {
  const { user } = useAuth();
  const [efforts, setEfforts] = useState<BestEffortOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .getBestEfforts(user.id)
      .then((res) => setEfforts(res.efforts))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Best Efforts", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : (
        <FlatList
          data={efforts}
          keyExtractor={(item) => item.route_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "Ride the same published route twice to set a best effort."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.cardTitle}>{item.route_name || item.destination_name || "Route"}</Text>
                <Text style={styles.cardSub}>{item.attempt_count} attempt{item.attempt_count === 1 ? "" : "s"}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.cardTime}>{formatDuration(item.best_moving_duration_seconds)}</Text>
                {item.best_avg_speed_kmh != null && <Text style={styles.cardSpeed}>{item.best_avg_speed_kmh.toFixed(0)} km/h avg</Text>}
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center" },
  listContent: { padding: 16, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14 },
  cardLeft: { flex: 1 },
  cardTitle: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  cardSub: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  cardRight: { alignItems: "flex-end" },
  cardTime: { color: RydrColors.gold, fontWeight: "800", fontSize: 14 },
  cardSpeed: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
});
