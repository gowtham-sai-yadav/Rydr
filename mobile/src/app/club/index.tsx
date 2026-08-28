import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
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
import { ClubOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function ClubsListScreen() {
  const router = useRouter();
  const [clubs, setClubs] = useState<ClubOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async (q: string) => {
    setError("");
    try {
      const res = await api.listClubs({ q: q || undefined, limit: 50 });
      setClubs(res.clubs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clubs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(query), query ? 300 : 0);
    return () => clearTimeout(handle);
  }, [query, load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(query);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await api.createClub({ name: name.trim(), city: city || null });
      setName("");
      setCity("");
      setCreating(false);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create club");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoinToggle = async (club: ClubOut) => {
    try {
      if (club.is_member) await api.leaveClub(club.id);
      else await api.joinClub(club.id);
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update membership");
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Clubs", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search clubs..."
            placeholderTextColor={RydrColors.mute}
          />
          <TouchableOpacity style={styles.createButton} onPress={() => setCreating((v) => !v)}>
            <Ionicons name={creating ? "close" : "add"} size={20} color={RydrColors.onGold} />
          </TouchableOpacity>
        </View>

        {creating && (
          <View style={styles.createPanel}>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Club name" placeholderTextColor={RydrColors.mute} />
            <TextInput style={styles.input} value={city} onChangeText={setCity} placeholder="City (optional)" placeholderTextColor={RydrColors.mute} />
            <TouchableOpacity style={styles.submitButton} onPress={handleCreate} disabled={submitting || !name.trim()}>
              <Text style={styles.submitButtonText}>{submitting ? "Creating..." : "Create club"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={RydrColors.gold} />
          </View>
        ) : (
          <FlatList
            data={clubs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>{error || "No clubs yet. Start one."}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <TouchableOpacity style={styles.cardBody} onPress={() => router.push(`/club/${item.id}`)}>
                  <Text style={styles.cardTitle}>{item.name}</Text>
                  {item.city && <Text style={styles.cardSubtitle}>{item.city}</Text>}
                  <Text style={styles.cardMeta}>{item.member_count} members</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.joinButton, item.is_member && styles.joinButtonActive]}
                  onPress={() => handleJoinToggle(item)}
                >
                  <Text style={[styles.joinButtonText, item.is_member && styles.joinButtonTextActive]}>
                    {item.is_member ? "Joined" : "Join"}
                  </Text>
                </TouchableOpacity>
              </View>
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
  headerRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  searchInput: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  createButton: { backgroundColor: RydrColors.gold, width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  createPanel: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  input: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  submitButton: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  submitButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14, gap: 10 },
  cardBody: { flex: 1 },
  cardTitle: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  cardSubtitle: { color: RydrColors.mute, fontSize: 12, marginTop: 2 },
  cardMeta: { color: RydrColors.mute, fontSize: 11, marginTop: 4 },
  joinButton: { backgroundColor: RydrColors.gold, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  joinButtonActive: { backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairline },
  joinButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 12 },
  joinButtonTextActive: { color: RydrColors.ink },
});
