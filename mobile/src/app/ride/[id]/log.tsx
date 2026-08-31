import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import type {
  FlybyOut,
  RideLogCommentOut,
  RideLogOut,
  RidePlanOut,
} from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";
import { useAuth } from "@/context/AuthContext";

export default function RideLogScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [ride, setRide] = useState<RidePlanOut | null>(null);
  const [log, setLog] = useState<RideLogOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [actualCost, setActualCost] = useState("");
  const [roadCondition, setRoadCondition] = useState<"good" | "ok" | "rough" | "bad" | "">("");
  const [recommended, setRecommended] = useState<"yes" | "no" | "">("");
  const [notes, setNotes] = useState("");

  // Star Ratings states
  const [stars, setStars] = useState(0);
  const [review, setReview] = useState("");
  const [ratingBusy, setRatingBusy] = useState(false);

  // Attachment states
  const [manualUrl, setManualUrl] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);

  // Comments states
  const [comments, setComments] = useState<RideLogCommentOut[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // Flybys
  const [flybys, setFlybys] = useState<FlybyOut[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const r = await api.getRide(id);
      setRide(r);

      const freshLog = await api.createRideLog({ ride_plan_id: id });
      setLog(freshLog);

      // Pre-fill state values
      setActualCost(freshLog.actual_cost?.toString() ?? "");
      setRoadCondition(freshLog.road_condition ?? "");
      setRecommended(freshLog.recommended === true ? "yes" : freshLog.recommended === false ? "no" : "");
      setNotes(freshLog.notes ?? "");

      if (freshLog.rating) {
        setStars(freshLog.rating.stars);
        setReview(freshLog.rating.review ?? "");
      }

      // Fetch comments
      try {
        const comms = await api.getRideLogComments(freshLog.id);
        setComments(comms.comments);
      } catch {
        // Non-blocking fallback
      }

      // Fetch flybys
      if (freshLog.recorded_track) {
        try {
          const matched = await api.getFlybys(freshLog.id);
          setFlybys(matched.flybys);
        } catch {
          // Non-blocking fallback
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load log info");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveFeedback = async () => {
    if (!log) return;
    setBusy(true);
    setError("");
    try {
      const fresh = await api.updateRideLog(log.id, {
        actual_cost: actualCost ? parseInt(actualCost) : null,
        road_condition: roadCondition || null,
        recommended: recommended === "yes" ? true : recommended === "no" ? false : null,
        notes: notes || null,
      });
      setLog(fresh);
      Alert.alert("Success", "Ride logs updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save log details");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRating = async () => {
    if (!ride || !log || stars < 1) return;
    setRatingBusy(true);
    setError("");
    try {
      await api.submitRating(ride.destination_id, {
        stars,
        review: review || undefined,
        ride_log_id: log.id,
      });
      Alert.alert("Success", "Destination rating submitted!");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save rating");
    } finally {
      setRatingBusy(false);
    }
  };

  const handleAttachMedia = async () => {
    if (!log || !manualUrl.trim()) return;
    setUploadBusy(true);
    setError("");
    try {
      await api.confirmRideMedia(log.id, {
        url: manualUrl.trim(),
        media_type: "image",
        link_to_destination: true,
      });
      setManualUrl("");
      Alert.alert("Success", "Media attached successfully");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to attach media URL");
    } finally {
      setUploadBusy(false);
    }
  };

  const handleRemoveMedia = async (mediaId: string) => {
    if (!log) return;
    Alert.alert("Remove Media", "Are you sure you want to remove this media?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.deleteRideMedia(log.id, mediaId);
            await load();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to delete media");
          }
        },
      },
    ]);
  };

  const handleAddComment = async () => {
    if (!log || !commentDraft.trim()) return;
    setCommentBusy(true);
    setError("");
    try {
      const created = await api.addRideLogComment(log.id, commentDraft.trim());
      setComments((prev) => [...prev, created]);
      setCommentDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!log) return;
    try {
      await api.deleteRideLogComment(log.id, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete comment");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!ride || !log) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Log data unavailable"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Log Ride Details",
          headerStyle: { backgroundColor: RydrColors.canvas },
          headerTintColor: RydrColors.ink,
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        
        {/* Ride Header Summary */}
        <View style={styles.headerCard}>
          <Text style={styles.rideTitle}>{ride.title}</Text>
          {ride.destination && <Text style={styles.rideSubtitle}>at {ride.destination.name}</Text>}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        ) : null}

        {/* 1. Personal Records Alert */}
        {log.new_personal_records.length > 0 && (
          <View style={styles.prBox}>
            <Text style={styles.prBoxText}>
              Personal record unlocked: {log.new_personal_records.join(", ")}
            </Text>
          </View>
        )}

        {/* 2. Telemetry Stats Panel */}
        {(log.distance_km != null || log.relative_effort != null) && (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Ride Statistics</Text>
            <View style={styles.statsGrid}>
              {log.distance_km != null && (
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Distance</Text>
                  <Text style={styles.statVal}>{log.distance_km.toFixed(1)} km</Text>
                </View>
              )}
              {log.relative_effort != null && (
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Effort Score</Text>
                  <Text style={styles.statVal}>{log.relative_effort.toFixed(0)}</Text>
                </View>
              )}
              {log.elevation_gain_m != null && (
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Elevation</Text>
                  <Text style={styles.statVal}>+{log.elevation_gain_m.toFixed(0)} m</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* 3. Log Details Form */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Log Rider Report</Text>
          
          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Estimated Cost (₹)</Text>
            <TextInput
              value={actualCost}
              onChangeText={setActualCost}
              keyboardType="numeric"
              placeholder="e.g. 350"
              placeholderTextColor={RydrColors.stone}
              style={styles.textInput}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Road Condition</Text>
            <View style={styles.pillRow}>
              {(["good", "ok", "rough", "bad"] as const).map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, roadCondition === c && styles.pillActive]}
                  onPress={() => setRoadCondition(c)}
                >
                  <Text style={[styles.pillText, roadCondition === c && styles.pillTextActive]}>
                    {c.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Recommend Route?</Text>
            <View style={styles.pillRow}>
              {(["yes", "no"] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.pill, recommended === r && styles.pillActive]}
                  onPress={() => setRecommended(r)}
                >
                  <Text style={[styles.pillText, recommended === r && styles.pillTextActive]}>
                    {r.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Log Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholder="Pace details, road construction, highlights..."
              placeholderTextColor={RydrColors.stone}
              style={[styles.textInput, styles.textArea]}
            />
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveFeedback}
            disabled={busy}
          >
            <Text style={styles.saveButtonText}>{busy ? "Saving Report..." : "Save Report"}</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Rating and Destination Review */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Rate Destination</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <TouchableOpacity key={s} onPress={() => setStars(s)}>
                <Ionicons
                  name={s <= stars ? "star" : "star-outline"}
                  size={28}
                  color={s <= stars ? RydrColors.gold : RydrColors.stone}
                />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Written Review (Optional)</Text>
            <TextInput
              value={review}
              onChangeText={setReview}
              placeholder="Food spots, scenic points, parking safety..."
              placeholderTextColor={RydrColors.stone}
              style={styles.textInput}
            />
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSaveRating}
            disabled={ratingBusy || stars < 1}
          >
            <Text style={styles.saveButtonText}>{ratingBusy ? "Submitting..." : "Submit Rating"}</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Photo Upload */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Media Gallery</Text>
          <View style={styles.formGroup}>
            <Text style={styles.inputLabel}>Attach Image URL</Text>
            <View style={styles.urlInputRow}>
              <TextInput
                value={manualUrl}
                onChangeText={setManualUrl}
                placeholder="https://..."
                placeholderTextColor={RydrColors.stone}
                style={[styles.textInput, { flex: 1 }]}
              />
              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handleAttachMedia}
                disabled={uploadBusy || !manualUrl}
              >
                <Text style={styles.attachBtnText}>Attach</Text>
              </TouchableOpacity>
            </View>
          </View>

          {log.media.length > 0 && (
            <View style={styles.mediaGrid}>
              {log.media.map((m) => (
                <View key={m.id} style={styles.mediaItem}>
                  <Image source={{ uri: m.url }} style={styles.mediaImg} />
                  <TouchableOpacity
                    style={styles.mediaDeleteBtn}
                    onPress={() => handleRemoveMedia(m.id)}
                  >
                    <Ionicons name="trash-outline" size={14} color={RydrColors.red} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 6. Matched Flyby Riders */}
        {flybys.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Squad Flybys</Text>
            <Text style={styles.infoSubtitle}>Matched riders nearby along your route</Text>
            <View style={styles.flybyList}>
              {flybys.map((f) => (
                <View key={f.rider.id} style={styles.flybyItem}>
                  <View style={styles.avatarSmall}>
                    <Text style={styles.avatarSmallText}>
                      {f.rider.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riderName}>{f.rider.name}</Text>
                    <Text style={styles.flybyDetails}>
                      Closest approach: {f.closest_distance_km.toFixed(2)} km {f.approx_time ? `at ${f.approx_time.slice(11, 16)}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 7. Comments and Notes Roster */}
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Comments</Text>
          <View style={styles.commentsList}>
            {comments.map((c) => (
              <View key={c.id} style={styles.commentItem}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{c.author?.name || "Rider"}</Text>
                  {c.author?.id === user?.id && (
                    <TouchableOpacity onPress={() => handleDeleteComment(c.id)}>
                      <Ionicons name="close-circle-outline" size={14} color={RydrColors.red} />
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            ))}
          </View>
          
          <View style={styles.commentInputRow}>
            <TextInput
              value={commentDraft}
              onChangeText={setCommentDraft}
              placeholder="Add details, pace comments..."
              placeholderTextColor={RydrColors.stone}
              style={[styles.textInput, { flex: 1 }]}
            />
            <TouchableOpacity
              style={styles.postBtn}
              onPress={handleAddComment}
              disabled={commentBusy || !commentDraft.trim()}
            >
              <Text style={styles.postBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 16, paddingBottom: 40 },
  headerCard: { paddingVertical: 8 },
  rideTitle: { color: RydrColors.ink, fontSize: 20, fontWeight: "800", textTransform: "uppercase" },
  rideSubtitle: { color: RydrColors.mute, fontSize: 13, marginTop: 2, fontWeight: "600" },
  errorText: { color: RydrColors.red, fontSize: 14, fontWeight: "600" },
  errorBox: { borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, padding: 12 },
  errorBoxText: { color: RydrColors.red, fontSize: 12 },
  prBox: { backgroundColor: "rgba(245,158,11,0.08)", borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", borderRadius: 12, padding: 14 },
  prBoxText: { color: RydrColors.gold, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  card: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 16, padding: 16, gap: 12 },
  cardHeading: { color: RydrColors.ink, fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  infoSubtitle: { color: RydrColors.mute, fontSize: 11, marginTop: -4 },
  statsGrid: { flexDirection: "row", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingTop: 4 },
  statItem: { flex: 1, minWidth: 80, backgroundColor: RydrColors.surfaceDeep, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: RydrColors.hairline },
  statLabel: { color: RydrColors.mute, fontSize: 10, textTransform: "uppercase", fontWeight: "600" },
  statVal: { color: RydrColors.ink, fontSize: 14, fontWeight: "800", marginTop: 4 },
  formGroup: { gap: 6 },
  inputLabel: { color: RydrColors.mute, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  textInput: { backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairlineStrong, color: RydrColors.ink, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  textArea: { height: 70, textAlignVertical: "top" },
  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  pill: { backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  pillActive: { borderColor: RydrColors.gold, backgroundColor: "rgba(245,158,11,0.08)" },
  pillText: { color: RydrColors.mute, fontSize: 10, fontWeight: "700" },
  pillTextActive: { color: RydrColors.gold },
  saveButton: { backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  saveButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  starsRow: { flexDirection: "row", gap: 10, paddingVertical: 4 },
  urlInputRow: { flexDirection: "row", gap: 8 },
  attachBtn: { backgroundColor: RydrColors.surfaceElevated, borderWidth: 1, borderColor: RydrColors.hairlineStrong, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  attachBtnText: { color: RydrColors.gold, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  mediaItem: { width: 80, height: 80, borderRadius: 8, overflow: "hidden", position: "relative" },
  mediaImg: { width: "100%", height: "100%" },
  mediaDeleteBtn: { position: "absolute", top: 4, right: 4, backgroundColor: "rgba(7,7,9,0.75)", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  flybyList: { gap: 10 },
  flybyItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: RydrColors.surfaceDeep, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: RydrColors.hairline },
  avatarSmall: { width: 32, height: 32, borderRadius: 16, backgroundColor: RydrColors.hairlineStrong, alignItems: "center", justifyContent: "center" },
  avatarSmallText: { color: RydrColors.ink, fontWeight: "700", fontSize: 12 },
  riderName: { color: RydrColors.ink, fontSize: 12, fontWeight: "700" },
  flybyDetails: { color: RydrColors.mute, fontSize: 10, marginTop: 1 },
  commentsList: { gap: 10, maxHeight: 180 },
  commentItem: { backgroundColor: RydrColors.surfaceDeep, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: RydrColors.hairline },
  commentHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  commentAuthor: { color: RydrColors.gold, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  commentBody: { color: RydrColors.ink, fontSize: 12, marginTop: 4 },
  commentInputRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  postBtn: { backgroundColor: RydrColors.gold, borderRadius: 10, paddingHorizontal: 16, justifyContent: "center", alignItems: "center" },
  postBtnText: { color: RydrColors.onGold, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
});
