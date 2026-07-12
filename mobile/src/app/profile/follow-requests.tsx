import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { FollowEdgeOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function FollowRequestsScreen() {
  const [edges, setEdges] = useState<FollowEdgeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.listFollowRequests();
      setEdges(res.edges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (userId: string, accept: boolean) => {
    setBusyId(userId);
    try {
      if (accept) await api.acceptFollowRequest(userId);
      else await api.rejectFollowRequest(userId);
      setEdges((prev) => prev.filter((e) => e.user.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Follow Requests", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : (
        <FlatList
          data={edges}
          keyExtractor={(item) => item.user.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No pending follow requests."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <Text style={styles.name}>{item.user.name}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => respond(item.user.id, true)}
                  disabled={busyId === item.user.id}
                >
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => respond(item.user.id, false)}
                  disabled={busyId === item.user.id}
                >
                  <Text style={styles.rejectText}>Decline</Text>
                </TouchableOpacity>
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
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarText: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  name: { color: RydrColors.ink, fontSize: 14, fontWeight: "600", flex: 1 },
  actions: { flexDirection: "row", gap: 8 },
  acceptButton: { backgroundColor: RydrColors.gold, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  acceptText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 12 },
  rejectButton: { borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  rejectText: { color: RydrColors.mute, fontWeight: "600", fontSize: 12 },
});
