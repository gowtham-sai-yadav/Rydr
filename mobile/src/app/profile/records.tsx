import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { PersonalRecordsOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function RecordsScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<PersonalRecordsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .getPersonalRecords(user.id)
      .then(setRecords)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load records"))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  const hasAny = records && (records.longest_ride || records.best_month || records.most_destinations_in_a_week);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Personal Records", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        {!hasAny && (
          <View style={styles.center}>
            <Text style={styles.emptyText}>{error || "Log a few rides to start setting records."}</Text>
          </View>
        )}

        {records?.longest_ride && (
          <RecordCard
            icon="trending-up-outline"
            label="Longest Ride"
            value={`${records.longest_ride.distance_km.toFixed(1)} km`}
            sub={records.longest_ride.destination_name ?? undefined}
          />
        )}

        {records?.best_month && (
          <RecordCard
            icon="calendar-outline"
            label="Best Month"
            value={`${records.best_month.total_distance_km.toFixed(0)} km`}
            sub={`${records.best_month.ride_count} rides · ${records.best_month.month}/${records.best_month.year}`}
          />
        )}

        {records?.most_destinations_in_a_week && (
          <RecordCard
            icon="map-outline"
            label="Best Week"
            value={`${records.most_destinations_in_a_week.destination_count} destinations`}
            sub={`week of ${records.most_destinations_in_a_week.week_start}`}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RecordCard({ icon, label, value, sub }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={22} color={RydrColors.gold} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardLabel}>{label}</Text>
        <Text style={styles.cardValue}>{value}</Text>
        {!!sub && <Text style={styles.cardSub}>{sub}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: RydrColors.canvas },
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center" },
  container: { padding: 16, gap: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 14, padding: 16 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(245,158,11,0.12)", alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 2 },
  cardLabel: { color: RydrColors.mute, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  cardValue: { color: RydrColors.ink, fontSize: 18, fontWeight: "800" },
  cardSub: { color: RydrColors.mute, fontSize: 12 },
});
