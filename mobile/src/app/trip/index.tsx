import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { TripOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function TripsListScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    api
      .listMyTrips()
      .then((res) => setTrips(res.trips))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load trips"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.createTrip({ name: name.trim() });
      setName("");
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "My Trips", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.createButton} onPress={() => setCreating((v) => !v)}>
            <Ionicons name={creating ? "close" : "add"} size={18} color={RydrColors.onGold} />
            <Text style={styles.createButtonText}>{creating ? "Cancel" : "New trip"}</Text>
          </TouchableOpacity>
        </View>

        {creating && (
          <View style={styles.createPanel}>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Trip name, e.g. Ladakh 2026" placeholderTextColor={RydrColors.mute} />
            <TouchableOpacity style={styles.submitButton} onPress={handleCreate} disabled={submitting || !name.trim()}>
              <Text style={styles.submitButtonText}>{submitting ? "Creating..." : "Create trip"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={RydrColors.gold} />
          </View>
        ) : (
          <FlatList
            data={trips}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>{error || "No trips yet — group a few logged rides into your first multi-day tour."}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => router.push(`/trip/${item.id}`)}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                {item.description && <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>}
                <Text style={styles.cardMeta}>{item.total_days} day{item.total_days === 1 ? "" : "s"} · {item.total_distance_km.toFixed(0)} km</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center" },
  headerRow: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 16, paddingTop: 12 },
  createButton: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: RydrColors.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  createButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  createPanel: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  input: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  submitButton: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  submitButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  card: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { color: RydrColors.ink, fontWeight: "700", fontSize: 15 },
  cardDescription: { color: RydrColors.mute, fontSize: 12 },
  cardMeta: { color: RydrColors.mute, fontSize: 11, marginTop: 4 },
});
