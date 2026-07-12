import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { RidePlanSummary, MineRideOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

type Tab = "upcoming" | "mine";

export default function RidesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upcoming");
  const [rides, setRides] = useState<(RidePlanSummary | MineRideOut)[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (t: Tab) => {
    setError("");
    try {
      if (t === "upcoming") {
        const res = await api.getRideFeed({ limit: 30 });
        setRides(res.rides);
      } else {
        const res = await api.getMyRides({ limit: 30 });
        setRides(res.rides);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rides");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    load(tab);
  }, [tab, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(tab);
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Rides</Text>
        <TouchableOpacity style={styles.createButton} onPress={() => router.push("/ride/create")}>
          <Ionicons name="add" size={20} color={RydrColors.onGold} />
        </TouchableOpacity>
      </View>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentItem, tab === "upcoming" && styles.segmentItemActive]}
          onPress={() => setTab("upcoming")}
        >
          <Text style={[styles.segmentText, tab === "upcoming" && styles.segmentTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentItem, tab === "mine" && styles.segmentItemActive]}
          onPress={() => setTab("mine")}
        >
          <Text style={[styles.segmentText, tab === "mine" && styles.segmentTextActive]}>Mine</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No rides here yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => router.push(`/ride/${item.id}`)}>
              {item.thumbnail_url ? (
                <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <Ionicons name="bicycle" size={22} color={RydrColors.mute} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {item.destination?.name ?? "Destination TBD"} · {item.planned_date}
                </Text>
                <View style={styles.metaRow}>
                  <Ionicons name="people-outline" size={13} color={RydrColors.mute} />
                  <Text style={styles.metaText}>
                    {item.participant_count} joined{item.max_riders ? ` / ${item.max_riders}` : " (no cap)"}
                  </Text>
                  {item.requires_approval && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Approval req.</Text>
                    </View>
                  )}
                </View>
              </View>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  header: { fontSize: 22, fontWeight: "800", color: RydrColors.ink },
  createButton: { backgroundColor: RydrColors.gold, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", marginHorizontal: 16, marginVertical: 12, backgroundColor: RydrColors.surfaceCard, borderRadius: 10, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentItemActive: { backgroundColor: RydrColors.hairline },
  segmentText: { color: RydrColors.mute, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: RydrColors.ink },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  emptyText: { color: RydrColors.mute, textAlign: "center", fontSize: 14 },
  card: {
    flexDirection: "row",
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 14,
    overflow: "hidden",
  },
  thumb: { width: 84, height: 84, backgroundColor: RydrColors.surfaceDeep },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, padding: 12, justifyContent: "center", gap: 4 },
  title: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  subtitle: { color: RydrColors.mute, fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4, flexWrap: "wrap" },
  metaText: { color: RydrColors.mute, fontSize: 11 },
  badge: { backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 4 },
  badgeText: { color: RydrColors.gold, fontSize: 10, fontWeight: "600" },
});
