import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { FollowEdgeOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function FollowingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [edges, setEdges] = useState<FollowEdgeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.getFollowing(id, { limit: 50 });
      setEdges(res.edges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load followers");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Following", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
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
              <Text style={styles.emptyText}>{error || "Not following anyone yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <Text style={styles.name}>{item.user.name}</Text>
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
  listContent: { padding: 16, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarText: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  name: { color: RydrColors.ink, fontSize: 14, fontWeight: "600" },
});
