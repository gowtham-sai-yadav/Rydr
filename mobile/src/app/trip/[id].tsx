import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { MyRideLogOut, TripOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [trip, setTrip] = useState<TripOut | null>(null);
  const [myLogs, setMyLogs] = useState<MyRideLogOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [t, logs] = await Promise.all([api.getTrip(id), api.getMyRideLogs(100)]);
      setTrip(t);
      setMyLogs(logs.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const usedLogIds = new Set(trip?.days.map((d) => d.ride_log_id) ?? []);
  const availableLogs = myLogs.filter((l) => !usedLogIds.has(l.id));

  const handleAddDay = async () => {
    if (!selectedLogId || !trip || !id) return;
    const nextDayIndex = trip.days.length > 0 ? Math.max(...trip.days.map((d) => d.day_index)) + 1 : 1;
    try {
      await api.addTripDay(id, { ride_log_id: selectedLogId, day_index: nextDayIndex });
      setSelectedLogId("");
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add day");
    }
  };

  const handleRemoveDay = async (rideLogId: string) => {
    if (!id) return;
    try {
      await api.removeTripDay(id, rideLogId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove day");
    }
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert("Delete trip?", "The ride logs themselves are untouched.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteTrip(id);
            router.replace("/trip");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete trip");
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Trip not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: trip.name, headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View style={styles.flexOne}>
            {trip.description && <Text style={styles.description}>{trip.description}</Text>}
            <Text style={styles.meta}>{trip.total_days} day{trip.total_days === 1 ? "" : "s"} · {trip.total_distance_km.toFixed(0)} km total</Text>
          </View>
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        {trip.days
          .slice()
          .sort((a, b) => a.day_index - b.day_index)
          .map((day) => (
            <TouchableOpacity key={day.ride_log_id} style={styles.dayCard} onPress={() => router.push(`/ride/${day.ride_plan_id}`)}>
              {day.thumbnail_url ? (
                <Image source={{ uri: day.thumbnail_url }} style={styles.dayThumb} />
              ) : (
                <View style={[styles.dayThumb, styles.dayThumbPlaceholder]} />
              )}
              <View style={styles.dayBody}>
                <Text style={styles.dayIndex}>Day {day.day_index}</Text>
                <Text style={styles.dayDest}>{day.destination_name || "Ride"}</Text>
                {day.distance_km != null && <Text style={styles.dayDistance}>{day.distance_km.toFixed(0)} km</Text>}
              </View>
              <TouchableOpacity onPress={() => handleRemoveDay(day.ride_log_id)} hitSlop={8}>
                <Text style={styles.removeText}>Remove</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}

        {adding ? (
          <View style={styles.addPanel}>
            {availableLogs.length === 0 ? (
              <Text style={styles.noLogsText}>No unassigned logged rides — log a ride first.</Text>
            ) : (
              availableLogs.map((log) => (
                <TouchableOpacity
                  key={log.id}
                  style={[styles.logOption, selectedLogId === log.id && styles.logOptionActive]}
                  onPress={() => setSelectedLogId(log.id)}
                >
                  <Text style={[styles.logOptionText, selectedLogId === log.id && styles.logOptionTextActive]}>
                    {log.destination_name || "Ride"}
                    {log.actual_start_ts ? ` — ${new Date(log.actual_start_ts).toLocaleDateString()}` : ""}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            <View style={styles.addActions}>
              <TouchableOpacity style={[styles.addConfirmButton, !selectedLogId && styles.addConfirmButtonDisabled]} onPress={handleAddDay} disabled={!selectedLogId}>
                <Text style={styles.addConfirmText}>Add</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setAdding(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.addDayButton} onPress={() => setAdding(true)}>
            <Text style={styles.addDayButtonText}>+ Add a day</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  errorText: { color: RydrColors.red, fontSize: 13, marginBottom: 8 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  flexOne: { flex: 1 },
  description: { color: RydrColors.ink, fontSize: 13 },
  meta: { color: RydrColors.mute, fontSize: 11, marginTop: 4 },
  deleteText: { color: RydrColors.red, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  dayCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 12 },
  dayThumb: { width: 56, height: 56, borderRadius: 10 },
  dayThumbPlaceholder: { backgroundColor: RydrColors.surfaceDeep },
  dayBody: { flex: 1 },
  dayIndex: { color: RydrColors.gold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  dayDest: { color: RydrColors.ink, fontWeight: "700", fontSize: 14, marginTop: 2 },
  dayDistance: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  removeText: { color: RydrColors.mute, fontSize: 11 },
  addPanel: { backgroundColor: RydrColors.surfaceCard, borderRadius: 12, padding: 12, gap: 8 },
  noLogsText: { color: RydrColors.mute, fontSize: 13, textAlign: "center", paddingVertical: 8 },
  logOption: { borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, padding: 12 },
  logOptionActive: { borderColor: RydrColors.gold, backgroundColor: "rgba(245,158,11,0.1)" },
  logOptionText: { color: RydrColors.ink, fontSize: 13 },
  logOptionTextActive: { color: RydrColors.gold, fontWeight: "700" },
  addActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 4 },
  addConfirmButton: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  addConfirmButtonDisabled: { opacity: 0.5 },
  addConfirmText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  cancelText: { color: RydrColors.mute, fontSize: 13 },
  addDayButton: { borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  addDayButtonText: { color: RydrColors.ink, fontSize: 14, fontWeight: "600" },
});
