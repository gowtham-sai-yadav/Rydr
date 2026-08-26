import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { YearInRydrOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

const CURRENT_YEAR = new Date().getFullYear();

export default function YearInRydrScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [recap, setRecap] = useState<YearInRydrOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api
      .getYearInRydr(user.id, year)
      .then(setRecap)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load recap"))
      .finally(() => setLoading(false));
  }, [user, year]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Year in Rydr", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.yearRow}>
          {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map((y) => (
            <TouchableOpacity key={y} style={[styles.yearChip, year === y && styles.yearChipActive]} onPress={() => setYear(y)}>
              <Text style={[styles.yearChipText, year === y && styles.yearChipTextActive]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {loading ? (
          <ActivityIndicator size="large" color={RydrColors.gold} style={styles.spinner} />
        ) : recap && recap.total_rides === 0 ? (
          <Text style={styles.emptyText}>No tracked rides in {year} yet.</Text>
        ) : recap ? (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroValue}>{recap.total_distance_km.toFixed(0)}</Text>
              <Text style={styles.heroLabel}>Kilometers ridden in {recap.year}</Text>
            </View>

            <View style={styles.statsGrid}>
              <Stat label="Rides logged" value={String(recap.total_rides)} />
              <Stat label="Elevation" value={`${recap.total_elevation_gain_m.toFixed(0)} m`} />
              <Stat label="Time riding" value={`${recap.total_moving_hours.toFixed(0)} h`} />
              <Stat label="Longest ride" value={recap.longest_ride_km ? `${recap.longest_ride_km.toFixed(0)} km` : "—"} />
              <Stat label="Destinations" value={String(recap.distinct_destinations)} />
              <Stat label="Badges earned" value={String(recap.badges_earned)} />
            </View>

            {recap.top_destination && (
              <TouchableOpacity style={styles.topDestCard} onPress={() => router.push(`/destination/${recap.top_destination!.destination_id}`)}>
                <Text style={styles.topDestLabel}>Most visited destination</Text>
                <Text style={styles.topDestName}>{recap.top_destination.name}</Text>
                <Text style={styles.topDestSub}>{recap.top_destination.ride_count} rides</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  yearRow: { flexDirection: "row", gap: 8 },
  yearChip: { backgroundColor: RydrColors.surfaceCard, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  yearChipActive: { backgroundColor: RydrColors.gold },
  yearChipText: { color: RydrColors.mute, fontSize: 13, fontWeight: "600" },
  yearChipTextActive: { color: RydrColors.onGold },
  errorText: { color: RydrColors.red, fontSize: 13 },
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center", paddingVertical: 40 },
  spinner: { marginTop: 40 },
  heroCard: { backgroundColor: "rgba(245,158,11,0.1)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", borderRadius: 16, padding: 28, alignItems: "center" },
  heroValue: { color: RydrColors.gold, fontSize: 52, fontWeight: "900" },
  heroLabel: { color: RydrColors.mute, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexBasis: "31%", flexGrow: 1, backgroundColor: RydrColors.surfaceCard, borderRadius: 12, padding: 12, alignItems: "center" },
  statValue: { color: RydrColors.ink, fontSize: 18, fontWeight: "800" },
  statLabel: { color: RydrColors.mute, fontSize: 10, textTransform: "uppercase", marginTop: 4, textAlign: "center" },
  topDestCard: { backgroundColor: RydrColors.surfaceCard, borderRadius: 14, padding: 16 },
  topDestLabel: { color: RydrColors.mute, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  topDestName: { color: RydrColors.ink, fontSize: 16, fontWeight: "700", marginTop: 4 },
  topDestSub: { color: RydrColors.mute, fontSize: 12, marginTop: 2 },
});
