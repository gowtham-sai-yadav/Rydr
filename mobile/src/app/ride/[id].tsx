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
import { RidePlanOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function RideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [ride, setRide] = useState<RidePlanOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const r = await api.getRide(id);
      setRide(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const myParticipation = ride?.participants.find((p) => p.user_id === user?.id);
  const isCaptain = ride?.captain_id === user?.id;

  const handleJoin = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.joinRide(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join ride");
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      await api.leaveRide(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave ride");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!ride) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Ride not found"}</Text>
      </SafeAreaView>
    );
  }

  const joinLabel = myParticipation
    ? myParticipation.status === "pending"
      ? "Request pending"
      : myParticipation.status === "approved"
        ? "Leave ride"
        : myParticipation.status === "waitlisted"
          ? "Waitlisted"
          : "Join ride"
    : ride.requires_approval
      ? "Request to join"
      : "Join ride";

  const canJoin = !myParticipation || myParticipation.status === "rejected" || myParticipation.status === "left";
  const canLeave = myParticipation?.status === "approved" || myParticipation?.status === "pending" || myParticipation?.status === "waitlisted";

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Ride", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        {ride.thumbnail_url ? (
          <Image source={{ uri: ride.thumbnail_url }} style={styles.hero} resizeMode="cover" />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <Ionicons name="bicycle" size={32} color={RydrColors.mute} />
          </View>
        )}

        <Text style={styles.title}>{ride.title}</Text>
        <Text style={styles.destination}>{ride.destination?.name ?? "Destination TBD"}</Text>

        <View style={styles.metaGrid}>
          <MetaItem icon="calendar-outline" label={ride.planned_date} />
          <MetaItem icon="time-outline" label={ride.planned_start_time.slice(0, 5)} />
          <MetaItem icon="trail-sign-outline" label={ride.difficulty_level} />
          <MetaItem
            icon="people-outline"
            label={`${ride.participant_count} joined${ride.max_riders ? ` / ${ride.max_riders}` : " (no cap)"}`}
          />
        </View>

        {!!ride.description && <Text style={styles.description}>{ride.description}</Text>}

        {!!error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        )}

        {!isCaptain && (
          <TouchableOpacity
            style={[styles.actionButton, !canJoin && !canLeave && styles.actionButtonDisabled]}
            onPress={canLeave ? handleLeave : handleJoin}
            disabled={actionLoading || (!canJoin && !canLeave)}
          >
            <Text style={styles.actionButtonText}>{actionLoading ? "..." : joinLabel}</Text>
          </TouchableOpacity>
        )}

        {(myParticipation?.status === "approved" || isCaptain) && (
          <TouchableOpacity style={styles.liveButton} onPress={() => router.push(`/ride/${ride.id}/live`)}>
            <Ionicons name="navigate" size={16} color={RydrColors.onGold} />
            <Text style={styles.liveButtonText}>Open live ride map</Text>
          </TouchableOpacity>
        )}

        {(myParticipation?.status === "approved" || isCaptain) && (ride.status === "in_progress" || ride.status === "completed") && (
          <TouchableOpacity style={styles.logButton} onPress={() => router.push(`/ride/${ride.id}/log`)}>
            <Ionicons name="clipboard-outline" size={16} color={RydrColors.gold} />
            <Text style={styles.logButtonText}>Log ride statistics</Text>
          </TouchableOpacity>
        )}

        {ride.chat_group_id && (myParticipation?.status === "approved" || isCaptain) && (
          <TouchableOpacity
            style={styles.chatButton}
            onPress={() => router.push(`/chat/${ride.chat_group_id}`)}
          >
            <Ionicons name="chatbubble-outline" size={16} color={RydrColors.gold} />
            <Text style={styles.chatButtonText}>Open group chat</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.sectionHeading}>Riders</Text>
        <View style={styles.participantsList}>
          {ride.captain && (
            <TouchableOpacity style={styles.participantRow} onPress={() => router.push(`/user/${ride.captain_id}`)}>
              <View style={styles.avatarSmall}>
                <Text style={styles.avatarSmallText}>{ride.captain.name?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
              <Text style={styles.participantName}>{ride.captain.name}</Text>
              <View style={styles.captainBadge}>
                <Text style={styles.captainBadgeText}>Captain</Text>
              </View>
            </TouchableOpacity>
          )}
          {ride.participants
            .filter((p) => p.status === "approved" && p.user)
            .map((p) => (
              <TouchableOpacity key={p.id} style={styles.participantRow} onPress={() => router.push(`/user/${p.user_id}`)}>
                <View style={styles.avatarSmall}>
                  <Text style={styles.avatarSmallText}>{p.user?.name?.[0]?.toUpperCase() ?? "?"}</Text>
                </View>
                <Text style={styles.participantName}>{p.user?.name}</Text>
              </TouchableOpacity>
            ))}
        </View>
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
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  hero: { width: "100%", height: 180, borderRadius: 14, backgroundColor: RydrColors.surfaceDeep },
  heroPlaceholder: { alignItems: "center", justifyContent: "center" },
  title: { color: RydrColors.ink, fontSize: 22, fontWeight: "800", marginTop: 8 },
  destination: { color: RydrColors.mute, fontSize: 14 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: RydrColors.surfaceCard, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: RydrColors.hairline },
  metaText: { color: RydrColors.mute, fontSize: 12 },
  description: { color: RydrColors.ink, fontSize: 13, lineHeight: 20, marginTop: 4 },
  errorText: { color: RydrColors.red, fontSize: 14 },
  errorBox: { borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, padding: 12 },
  errorBoxText: { color: RydrColors.red, fontSize: 12 },
  actionButton: { backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  actionButtonDisabled: { opacity: 0.5 },
  actionButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 14 },
  liveButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 12 },
  liveButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  chatButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, paddingVertical: 12 },
  chatButtonText: { color: RydrColors.gold, fontWeight: "600", fontSize: 13 },
  logButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, paddingVertical: 12 },
  logButtonText: { color: RydrColors.gold, fontWeight: "600", fontSize: 13 },
  sectionHeading: { color: RydrColors.ink, fontWeight: "700", fontSize: 15, marginTop: 12 },
  participantsList: { gap: 8 },
  participantRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, padding: 10 },
  avatarSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarSmallText: { color: RydrColors.ink, fontWeight: "700", fontSize: 12 },
  participantName: { color: RydrColors.ink, fontSize: 13, flex: 1 },
  captainBadge: { backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  captainBadgeText: { color: RydrColors.gold, fontSize: 10, fontWeight: "700" },
});
