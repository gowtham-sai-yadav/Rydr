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
import { EventOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function EventsListScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [meetingPoint, setMeetingPoint] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.listEvents({ upcoming_only: true, limit: 50 });
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load events");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleCreate = async () => {
    if (!title.trim() || !eventDate || !eventTime) return;
    setSubmitting(true);
    try {
      await api.createEvent({
        title: title.trim(),
        event_date: new Date(`${eventDate}T${eventTime}:00`).toISOString(),
        meeting_point: meetingPoint || null,
      });
      setTitle("");
      setEventDate("");
      setEventTime("");
      setMeetingPoint("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Events", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Upcoming Events</Text>
          <TouchableOpacity style={styles.createButton} onPress={() => setCreating((v) => !v)}>
            <Ionicons name={creating ? "close" : "add"} size={20} color={RydrColors.onGold} />
          </TouchableOpacity>
        </View>

        {creating && (
          <View style={styles.createPanel}>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Event title" placeholderTextColor={RydrColors.mute} />
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flexOne]} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" placeholderTextColor={RydrColors.mute} />
              <TextInput style={[styles.input, styles.flexOne]} value={eventTime} onChangeText={setEventTime} placeholder="HH:MM" placeholderTextColor={RydrColors.mute} />
            </View>
            <TextInput style={styles.input} value={meetingPoint} onChangeText={setMeetingPoint} placeholder="Meeting point (optional)" placeholderTextColor={RydrColors.mute} />
            <TouchableOpacity style={styles.submitButton} onPress={handleCreate} disabled={submitting || !title.trim() || !eventDate || !eventTime}>
              <Text style={styles.submitButtonText}>{submitting ? "Creating..." : "Create event"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={RydrColors.gold} />
          </View>
        ) : (
          <FlatList
            data={events}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.emptyText}>{error || "No upcoming events."}</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.card} onPress={() => router.push(`/event/${item.id}`)}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{new Date(item.event_date).toLocaleString()}</Text>
                {item.meeting_point && <Text style={styles.cardMeta}>at {item.meeting_point}</Text>}
                <Text style={styles.cardMeta}>{item.going_count} going · {item.interested_count} interested</Text>
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
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  header: { fontSize: 18, fontWeight: "800", color: RydrColors.ink },
  createButton: { backgroundColor: RydrColors.gold, width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  createPanel: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  input: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  row: { flexDirection: "row", gap: 8 },
  flexOne: { flex: 1 },
  submitButton: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  submitButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  listContent: { padding: 16, gap: 10 },
  card: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14, gap: 3 },
  cardTitle: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  cardSubtitle: { color: RydrColors.mute, fontSize: 12 },
  cardMeta: { color: RydrColors.mute, fontSize: 11 },
});
