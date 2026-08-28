import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { EventOut, EventRSVPOut, RSVPStatus } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

const RSVP_OPTIONS: { value: RSVPStatus; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "interested", label: "Interested" },
  { value: "not_going", label: "Can't go" },
];

export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [event, setEvent] = useState<EventOut | null>(null);
  const [rsvps, setRsvps] = useState<EventRSVPOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [e, r] = await Promise.all([api.getEvent(id), api.listEventRsvps(id)]);
      setEvent(e);
      setRsvps(r.rsvps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRsvp = async (status: RSVPStatus) => {
    if (!id) return;
    setBusy(true);
    try {
      await api.setEventRsvp(id, status);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to RSVP");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Event not found"}</Text>
      </SafeAreaView>
    );
  }

  const going = rsvps.filter((r) => r.status === "going");

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Event", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <FlatList
        data={going}
        keyExtractor={(r) => r.user.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={styles.title}>{event.title}</Text>
            <Text style={styles.subtitle}>{new Date(event.event_date).toLocaleString()}</Text>
            {event.meeting_point && <Text style={styles.meta}>Meeting at {event.meeting_point}</Text>}
            {!!event.description && <Text style={styles.description}>{event.description}</Text>}
            <Text style={styles.meta}>{event.going_count} going · {event.interested_count} interested</Text>

            {!!error && <Text style={styles.errorInline}>{error}</Text>}

            <View style={styles.rsvpRow}>
              {RSVP_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.rsvpButton, event.my_rsvp === opt.value && styles.rsvpButtonActive]}
                  onPress={() => handleRsvp(opt.value)}
                  disabled={busy}
                >
                  <Text style={[styles.rsvpButtonText, event.my_rsvp === opt.value && styles.rsvpButtonTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionHeading}>Attendees</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.emptyText}>No one&apos;s RSVP&apos;d going yet.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.attendeeRow} onPress={() => router.push(`/user/${item.user.id}`)}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.user.name.charAt(0)}</Text></View>
            <Text style={styles.attendeeName}>{item.user.name}</Text>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  errorText: { color: RydrColors.mute, fontSize: 14 },
  errorInline: { color: RydrColors.red, fontSize: 12, marginTop: 8 },
  emptyText: { color: RydrColors.mute, fontSize: 13 },
  listContent: { padding: 16, gap: 8 },
  title: { color: RydrColors.ink, fontSize: 20, fontWeight: "800" },
  subtitle: { color: RydrColors.mute, fontSize: 13, marginTop: 4 },
  meta: { color: RydrColors.mute, fontSize: 12, marginTop: 4 },
  description: { color: RydrColors.ink, fontSize: 13, marginTop: 10 },
  rsvpRow: { flexDirection: "row", gap: 8, marginTop: 16 },
  rsvpButton: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  rsvpButtonActive: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  rsvpButtonText: { color: RydrColors.ink, fontWeight: "600", fontSize: 12 },
  rsvpButtonTextActive: { color: RydrColors.onGold },
  sectionHeading: { color: RydrColors.ink, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 8 },
  attendeeRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, padding: 10 },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarText: { color: RydrColors.ink, fontWeight: "700", fontSize: 12 },
  attendeeName: { color: RydrColors.ink, fontSize: 13 },
});
