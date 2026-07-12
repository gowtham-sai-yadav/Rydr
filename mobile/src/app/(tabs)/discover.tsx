import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { DestinationSummary, RegionSummary } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function DiscoverScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [destinations, setDestinations] = useState<DestinationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [surpriseOpen, setSurpriseOpen] = useState(false);
  const [surpriseHours, setSurpriseHours] = useState("3");
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseError, setSurpriseError] = useState("");
  const canUseDistance = !!user?.home_latitude && !!user?.home_longitude;

  const [regions, setRegions] = useState<RegionSummary[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const load = useCallback(async (region: string | null) => {
    setError("");
    try {
      const res = await api.listDestinations({ sort: "popularity", limit: 30, region: region || undefined });
      setDestinations(res.destinations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load destinations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(selectedRegion);
  }, [load, selectedRegion]);

  useEffect(() => {
    api.listRegions().then((res) => setRegions(res.regions)).catch(() => {});
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load(selectedRegion);
  };

  const handleSurpriseMe = async () => {
    setSurpriseError("");
    const hours = parseFloat(surpriseHours);
    if (Number.isNaN(hours) || hours <= 0) {
      setSurpriseError("Enter a valid number of hours");
      return;
    }
    if (!canUseDistance) {
      setSurpriseError("Set your home location in Settings first");
      return;
    }
    setSurpriseLoading(true);
    try {
      const dest = await api.surpriseMe({
        time_budget_hours: hours,
        from_lat: user!.home_latitude!,
        from_lng: user!.home_longitude!,
      });
      setSurpriseOpen(false);
      router.push(`/destination/${dest.id}`);
    } catch (err) {
      setSurpriseError(err instanceof Error ? err.message : "Couldn't find a match");
    } finally {
      setSurpriseLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Discover</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.surpriseButton} onPress={() => setSurpriseOpen((v) => !v)}>
            <Text style={styles.surpriseButtonText}>🎲</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => router.push("/destination/new")}>
            <Ionicons name="add" size={20} color={RydrColors.onGold} />
          </TouchableOpacity>
        </View>
      </View>

      {regions.length > 0 && (
        <FlatList
          horizontal
          data={regions}
          keyExtractor={(r) => r.region}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.regionRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.regionChip, selectedRegion === item.region && styles.regionChipActive]}
              onPress={() => setSelectedRegion(item.region === selectedRegion ? null : item.region)}
            >
              <Text style={[styles.regionChipText, selectedRegion === item.region && styles.regionChipTextActive]}>
                {item.region} ({item.destination_count})
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {surpriseOpen && (
        <View style={styles.surprisePanel}>
          <Text style={styles.surpriseLabel}>How much time do you have?</Text>
          <View style={styles.surpriseRow}>
            <TextInput
              style={styles.surpriseInput}
              value={surpriseHours}
              onChangeText={setSurpriseHours}
              keyboardType="decimal-pad"
            />
            <Text style={styles.surpriseUnit}>hours, round trip</Text>
          </View>
          <TouchableOpacity style={styles.surpriseSubmit} onPress={handleSurpriseMe} disabled={surpriseLoading}>
            <Text style={styles.surpriseSubmitText}>{surpriseLoading ? "Picking..." : "Surprise me"}</Text>
          </TouchableOpacity>
          {!!surpriseError && <Text style={styles.surpriseError}>{surpriseError}</Text>}
        </View>
      )}

      <FlatList
        data={destinations}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>{error || "No destinations yet."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/destination/${item.id}`)}>
            {item.hero_media_url ? (
              <Image source={{ uri: item.hero_media_url }} style={styles.image} resizeMode="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}>
                <Ionicons name="image-outline" size={20} color={RydrColors.mute} />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.region} numberOfLines={1}>{item.region ?? item.country}</Text>
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={12} color={RydrColors.gold} />
                <Text style={styles.ratingText}>
                  {item.avg_rating.toFixed(1)} ({item.rating_count})
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas, padding: 24 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  header: { fontSize: 22, fontWeight: "800", color: RydrColors.ink },
  headerActions: { flexDirection: "row", gap: 8 },
  regionRow: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  regionChip: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8 },
  regionChipActive: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  regionChipText: { color: RydrColors.mute, fontSize: 11, fontWeight: "700" },
  regionChipTextActive: { color: RydrColors.onGold },
  addButton: { backgroundColor: RydrColors.gold, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  surpriseButton: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  surpriseButtonText: { fontSize: 16 },
  surprisePanel: { marginHorizontal: 16, marginBottom: 12, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14, gap: 8 },
  surpriseLabel: { color: RydrColors.ink, fontSize: 13, fontWeight: "600" },
  surpriseRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  surpriseInput: { width: 60, backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, color: RydrColors.ink, fontSize: 14 },
  surpriseUnit: { color: RydrColors.mute, fontSize: 12 },
  surpriseSubmit: { backgroundColor: RydrColors.gold, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  surpriseSubmitText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  surpriseError: { color: RydrColors.red, fontSize: 11 },
  listContent: { paddingHorizontal: 12, paddingBottom: 24, gap: 12 },
  row: { gap: 12, paddingHorizontal: 4 },
  emptyText: { color: RydrColors.mute, textAlign: "center", fontSize: 14 },
  card: {
    flex: 1,
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 14,
    overflow: "hidden",
  },
  image: { width: "100%", height: 110, backgroundColor: RydrColors.surfaceDeep },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 10, gap: 3 },
  name: { color: RydrColors.ink, fontWeight: "700", fontSize: 13 },
  region: { color: RydrColors.mute, fontSize: 11 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  ratingText: { color: RydrColors.mute, fontSize: 11 },
});
