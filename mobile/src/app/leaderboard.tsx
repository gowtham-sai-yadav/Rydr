import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { RiderLeaderboardEntry, DestinationLeaderboardEntry, WeeklyLeagueTier } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

type Tab = "riders" | "destinations" | "league";

const TIER_COLORS: Record<string, string> = { gold: RydrColors.gold, silver: "#C0C0C0", bronze: "#B08D57" };

export default function LeaderboardScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("riders");
  const [riders, setRiders] = useState<RiderLeaderboardEntry[]>([]);
  const [destinations, setDestinations] = useState<DestinationLeaderboardEntry[]>([]);
  const [leagueTiers, setLeagueTiers] = useState<WeeklyLeagueTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (t: Tab) => {
    setError("");
    try {
      if (t === "riders") {
        const res = await api.getRiderLeaderboard(30);
        setRiders(res.entries);
      } else if (t === "destinations") {
        const res = await api.getDestinationLeaderboard(30);
        setDestinations(res.entries);
      } else {
        const res = await api.getWeeklyLeague();
        setLeagueTiers(res.tiers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(tab);
  }, [tab, load]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Leaderboard", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />

      <View style={styles.segment}>
        <TouchableOpacity style={[styles.segmentItem, tab === "riders" && styles.segmentItemActive]} onPress={() => setTab("riders")}>
          <Text style={[styles.segmentText, tab === "riders" && styles.segmentTextActive]}>Riders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentItem, tab === "destinations" && styles.segmentItemActive]} onPress={() => setTab("destinations")}>
          <Text style={[styles.segmentText, tab === "destinations" && styles.segmentTextActive]}>Destinations</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentItem, tab === "league" && styles.segmentItemActive]} onPress={() => setTab("league")}>
          <Text style={[styles.segmentText, tab === "league" && styles.segmentTextActive]}>League</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : tab === "riders" ? (
        <FlatList
          data={riders}
          keyExtractor={(item) => item.user.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No riders yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
              <Text style={styles.rank}>{item.rank}</Text>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <Text style={styles.name}>{item.user.name}</Text>
              <Text style={styles.metric}>{item.rides_logged} rides</Text>
            </TouchableOpacity>
          )}
        />
      ) : tab === "destinations" ? (
        <FlatList
          data={destinations}
          keyExtractor={(item) => item.destination_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No destinations yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/destination/${item.destination_id}`)}>
              <Text style={styles.rank}>{item.rank}</Text>
              <View style={styles.avatar}>
                <Ionicons name="location" size={16} color={RydrColors.gold} />
              </View>
              <Text style={styles.name}>{item.destination_name}</Text>
              <Text style={styles.metric}>{item.ride_count} rides</Text>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={leagueTiers}
          keyExtractor={(item) => item.user.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No one's logged a distance-tracked ride this week."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
              <View style={[styles.tierDot, { backgroundColor: TIER_COLORS[item.tier] }]} />
              <Text style={styles.rank}>{item.rank}</Text>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <Text style={styles.name}>{item.user.name}</Text>
              <Text style={[styles.metric, { color: TIER_COLORS[item.tier] }]}>{item.distance_km.toFixed(0)} km</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: RydrColors.mute, fontSize: 14 },
  segment: { flexDirection: "row", marginHorizontal: 16, marginVertical: 12, backgroundColor: RydrColors.surfaceCard, borderRadius: 10, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentItemActive: { backgroundColor: RydrColors.hairline },
  segmentText: { color: RydrColors.mute, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: RydrColors.ink },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 12 },
  rank: { color: RydrColors.gold, fontWeight: "800", fontSize: 14, width: 22, textAlign: "center" },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarText: { color: RydrColors.ink, fontWeight: "700", fontSize: 13 },
  name: { color: RydrColors.ink, fontSize: 14, fontWeight: "600", flex: 1 },
  metric: { color: RydrColors.mute, fontSize: 12 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
});
