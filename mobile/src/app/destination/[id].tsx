import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { DestinationOut, LocalLegendOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function DestinationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [destination, setDestination] = useState<DestinationOut | null>(null);
  const [localLegend, setLocalLegend] = useState<LocalLegendOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const d = await api.getDestination(id);
      setDestination(d);
      api.getLocalLegend(id).then(setLocalLegend).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load destination");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!destination) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Destination not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: destination.name, headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        {destination.hero_media_url ? (
          <Image source={{ uri: destination.hero_media_url }} style={styles.hero} resizeMode="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Ionicons name="image-outline" size={28} color={RydrColors.mute} />
          </View>
        )}

        <Text style={styles.title}>{destination.name}</Text>
        <Text style={styles.region}>{destination.region ?? destination.country}</Text>

        <View style={styles.ratingRow}>
          <Ionicons name="star" size={14} color={RydrColors.gold} />
          <Text style={styles.ratingText}>
            {destination.avg_rating.toFixed(1)} ({destination.rating_count} ratings)
          </Text>
          <View style={styles.difficultyBadge}>
            <Text style={styles.difficultyText}>{destination.terrain_difficulty}</Text>
          </View>
        </View>

        {destination.tags.length > 0 && (
          <View style={styles.tagsRow}>
            {destination.tags.map((tag) => (
              <View key={tag.slug} style={styles.tag}>
                <Text style={styles.tagText}>{tag.label}</Text>
              </View>
            ))}
          </View>
        )}

        {!!destination.description && <Text style={styles.description}>{destination.description}</Text>}

        <View style={styles.metaGrid}>
          {destination.best_season && <MetaItem icon="leaf-outline" label={`Best season: ${destination.best_season}`} />}
          {destination.best_time_of_day && <MetaItem icon="sunny-outline" label={`Best time: ${destination.best_time_of_day}`} />}
          {destination.estimated_food_cost != null && (
            <MetaItem icon="restaurant-outline" label={`Food: ~${destination.currency} ${destination.estimated_food_cost}`} />
          )}
          {destination.estimated_entry_cost != null && (
            <MetaItem icon="ticket-outline" label={`Entry: ~${destination.currency} ${destination.estimated_entry_cost}`} />
          )}
        </View>

        {localLegend?.user && (
          <TouchableOpacity style={styles.legendCard} onPress={() => router.push(`/user/${localLegend.user!.id}`)}>
            <Text style={styles.legendEmoji}>👑</Text>
            <View>
              <Text style={styles.legendLabel}>Local Legend — last {localLegend.window_days} days</Text>
              <Text style={styles.legendName}>{localLegend.user.name} · {localLegend.ride_count} ride{localLegend.ride_count === 1 ? "" : "s"}</Text>
            </View>
          </TouchableOpacity>
        )}

        {destination.recent_riders.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>Recently rode here</Text>
            <View style={styles.ridersRow}>
              {destination.recent_riders.map((r) => (
                <View key={r.id} style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{r.name?.[0]?.toUpperCase() ?? "?"}</Text>
                </View>
              ))}
              <Text style={styles.ridersCount}>{destination.recent_rider_count} riders</Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function MetaItem({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={14} color={RydrColors.mute} />
      <Text style={styles.metaText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 10, paddingBottom: 40 },
  hero: { width: "100%", height: 200, borderRadius: 14, backgroundColor: RydrColors.surfaceDeep },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  title: { color: RydrColors.ink, fontSize: 22, fontWeight: "800", marginTop: 8 },
  region: { color: RydrColors.mute, fontSize: 14 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  ratingText: { color: RydrColors.mute, fontSize: 13 },
  difficultyBadge: { backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  difficultyText: { color: RydrColors.gold, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  tag: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: RydrColors.ink, fontSize: 11 },
  description: { color: RydrColors.ink, fontSize: 13, lineHeight: 20, marginTop: 4 },
  metaGrid: { gap: 8, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  metaText: { color: RydrColors.mute, fontSize: 13 },
  sectionHeading: { color: RydrColors.ink, fontWeight: "700", fontSize: 15, marginTop: 8 },
  ridersRow: { flexDirection: "row", alignItems: "center", gap: -6 },
  avatarSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: RydrColors.canvas, marginLeft: -6 },
  avatarSmallText: { color: RydrColors.ink, fontWeight: "700", fontSize: 11 },
  ridersCount: { color: RydrColors.mute, fontSize: 12, marginLeft: 12 },
  errorText: { color: RydrColors.red, fontSize: 14 },
  legendCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", borderRadius: 12, padding: 14 },
  legendEmoji: { fontSize: 22 },
  legendLabel: { color: RydrColors.gold, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  legendName: { color: RydrColors.ink, fontWeight: "600", fontSize: 13, marginTop: 2 },
});
