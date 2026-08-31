import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
import { ChatGroupOut, DMThreadOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

type Tab = "rides" | "messages";

export default function ChatScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("rides");
  const [groups, setGroups] = useState<ChatGroupOut[]>([]);
  const [threads, setThreads] = useState<DMThreadOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (t: Tab) => {
    setError("");
    try {
      if (t === "rides") {
        const res = await api.getChatGroups({ limit: 30 });
        setGroups(res.groups);
      } else {
        const res = await api.listDMThreads();
        setThreads(res.threads);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chats");
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
      <Text style={styles.header}>Chat</Text>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentItem, tab === "rides" && styles.segmentItemActive]}
          onPress={() => setTab("rides")}
        >
          <Text style={[styles.segmentText, tab === "rides" && styles.segmentTextActive]}>Ride Groups</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentItem, tab === "messages" && styles.segmentItemActive]}
          onPress={() => setTab("messages")}
        >
          <Text style={[styles.segmentText, tab === "messages" && styles.segmentTextActive]}>Messages</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : tab === "rides" ? (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No ride group chats yet. Join a ride to get one."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
              <View style={styles.iconCircle}>
                <Ionicons name="people" size={18} color={RydrColors.gold} />
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
                {item.ride && (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>{item.ride.title}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={RydrColors.mute} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No direct messages yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/chat/dm/${item.id}`)}>
              <View style={styles.iconCircle}>
                <Text style={styles.avatarInitial}>{item.other_user.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowTitleLine}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{item.other_user.name}</Text>
                  {item.unread_count > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadText}>{item.unread_count}</Text>
                    </View>
                  )}
                </View>
                {!!item.last_message && (
                  <Text style={styles.rowSubtitle} numberOfLines={1}>{item.last_message}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={RydrColors.mute} />
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
  header: { fontSize: 22, fontWeight: "800", color: RydrColors.ink, paddingHorizontal: 16, paddingTop: 8 },
  segment: { flexDirection: "row", marginHorizontal: 16, marginVertical: 12, backgroundColor: RydrColors.surfaceCard, borderRadius: 10, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  segmentItemActive: { backgroundColor: RydrColors.hairline },
  segmentText: { color: RydrColors.mute, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: RydrColors.ink },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  emptyText: { color: RydrColors.mute, textAlign: "center", fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 12,
    padding: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RydrColors.surfaceDeep,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { color: RydrColors.ink, fontWeight: "700", fontSize: 15 },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowTitle: { color: RydrColors.ink, fontWeight: "600", fontSize: 14 },
  rowSubtitle: { color: RydrColors.mute, fontSize: 12 },
  unreadBadge: { backgroundColor: RydrColors.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadText: { color: RydrColors.onGold, fontSize: 10, fontWeight: "700" },
});
