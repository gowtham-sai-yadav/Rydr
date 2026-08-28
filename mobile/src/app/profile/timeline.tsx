import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { TimelineEntryOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function TimelineScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<TimelineEntryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .getTimeline(user.id, 150)
      .then((res) => setEntries(res.entries))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load timeline"))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Photo Timeline", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.media_id}
          numColumns={3}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No photos attached to your rides yet."}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.tile} onPress={() => router.push(`/ride/${item.ride_plan_id}/log`)}>
              <Image source={{ uri: item.url }} style={styles.tileImage} />
              <View style={styles.tileOverlay}>
                <Text style={styles.tileDest} numberOfLines={1}>{item.destination_name || "Ride"}</Text>
                <Text style={styles.tileDate}>{formatDate(item.taken_at)}</Text>
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
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center" },
  listContent: { padding: 8, gap: 4 },
  row: { gap: 4 },
  tile: { flex: 1 / 3, aspectRatio: 1, position: "relative", margin: 2, borderRadius: 8, overflow: "hidden", backgroundColor: RydrColors.surfaceCard },
  tileImage: { width: "100%", height: "100%" },
  tileOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(7,7,9,0.75)", padding: 4 },
  tileDest: { color: RydrColors.ink, fontSize: 9, fontWeight: "700" },
  tileDate: { color: RydrColors.mute, fontSize: 8 },
});
