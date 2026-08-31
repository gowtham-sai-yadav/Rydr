import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { DestinationSummary, DifficultyLevel } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

const DIFFICULTIES: DifficultyLevel[] = ["easy", "moderate", "hard", "expert"];

export default function CreateRideScreen() {
  const router = useRouter();

  const [destQuery, setDestQuery] = useState("");
  const [destResults, setDestResults] = useState<DestinationSummary[]>([]);
  const [destination, setDestination] = useState<DestinationSummary | null>(null);
  const [searching, setSearching] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [plannedTime, setPlannedTime] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("moderate");
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [noLimit, setNoLimit] = useState(true);
  const [maxRiders, setMaxRiders] = useState("10");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const searchDestinations = useCallback(async (q: string) => {
    setDestQuery(q);
    if (q.trim().length < 2) {
      setDestResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.listDestinations({ q, limit: 8 });
      setDestResults(res.destinations);
    } catch {
      // ignore search errors, just show no results
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSubmit = async () => {
    setError("");
    if (!destination) {
      setError("Pick a destination");
      return;
    }
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) {
      setError("Date must be in YYYY-MM-DD format");
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(plannedTime)) {
      setError("Start time must be in HH:MM format");
      return;
    }
    setSubmitting(true);
    try {
      const ride = await api.createRide({
        destination_id: destination.id,
        title: title.trim(),
        description: description.trim() || null,
        planned_date: plannedDate,
        planned_start_time: `${plannedTime}:00`,
        visibility: "group",
        difficulty_level: difficulty,
        requires_approval: requiresApproval,
        max_riders: noLimit ? null : parseInt(maxRiders, 10) || null,
      });
      router.replace(`/ride/${ride.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ride");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Create Ride", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Destination</Text>
          {destination ? (
            <TouchableOpacity style={styles.selectedDest} onPress={() => setDestination(null)}>
              <Text style={styles.selectedDestText}>{destination.name}</Text>
              <Text style={styles.selectedDestChange}>Change</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={destQuery}
                onChangeText={searchDestinations}
                placeholder="Search destinations..."
                placeholderTextColor={RydrColors.mute}
              />
              {searching && <ActivityIndicator size="small" color={RydrColors.gold} style={styles.searchSpinner} />}
              {destResults.length > 0 && (
                <FlatList
                  data={destResults}
                  keyExtractor={(item) => item.id}
                  style={styles.suggestionsList}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.suggestionRow}
                      onPress={() => {
                        setDestination(item);
                        setDestResults([]);
                        setDestQuery("");
                      }}
                    >
                      <Text style={styles.suggestionText}>{item.name}</Text>
                      <Text style={styles.suggestionSubtext}>{item.region ?? item.country}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          )}

          <Text style={styles.label}>Title</Text>
          <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Weekend loop to..." placeholderTextColor={RydrColors.mute} />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Plan details, meeting point, etc."
            placeholderTextColor={RydrColors.mute}
            multiline
          />

          <View style={styles.row}>
            <View style={styles.flexOne}>
              <Text style={styles.label}>Date</Text>
              <TextInput style={styles.input} value={plannedDate} onChangeText={setPlannedDate} placeholder="YYYY-MM-DD" placeholderTextColor={RydrColors.mute} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.label}>Start time</Text>
              <TextInput style={styles.input} value={plannedTime} onChangeText={setPlannedTime} placeholder="HH:MM" placeholderTextColor={RydrColors.mute} />
            </View>
          </View>

          <Text style={styles.label}>Difficulty</Text>
          <View style={styles.difficultyRow}>
            {DIFFICULTIES.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.difficultyChip, difficulty === d && styles.difficultyChipActive]}
                onPress={() => setDifficulty(d)}
              >
                <Text style={[styles.difficultyChipText, difficulty === d && styles.difficultyChipTextActive]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Require approval to join</Text>
            <Switch
              value={requiresApproval}
              onValueChange={setRequiresApproval}
              trackColor={{ false: RydrColors.hairline, true: RydrColors.gold }}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>No rider limit</Text>
            <Switch value={noLimit} onValueChange={setNoLimit} trackColor={{ false: RydrColors.hairline, true: RydrColors.gold }} />
          </View>

          {!noLimit && (
            <>
              <Text style={styles.label}>Max riders</Text>
              <TextInput style={styles.input} value={maxRiders} onChangeText={setMaxRiders} keyboardType="number-pad" />
            </>
          )}

          <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.submitButtonText}>{submitting ? "Creating..." : "Create Ride"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 4, paddingBottom: 60 },
  label: { color: RydrColors.mute, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginTop: 14, marginBottom: 8 },
  input: {
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: RydrColors.ink,
    fontSize: 14,
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 12 },
  flexOne: { flex: 1 },
  errorBox: { borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { color: RydrColors.red, fontSize: 12 },
  selectedDest: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.gold, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  selectedDestText: { color: RydrColors.ink, fontWeight: "600", fontSize: 14 },
  selectedDestChange: { color: RydrColors.gold, fontSize: 12, fontWeight: "600" },
  searchSpinner: { marginTop: 8 },
  suggestionsList: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, marginTop: 4, maxHeight: 220 },
  suggestionRow: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: RydrColors.hairline },
  suggestionText: { color: RydrColors.ink, fontSize: 13, fontWeight: "600" },
  suggestionSubtext: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  difficultyRow: { flexDirection: "row", gap: 8 },
  difficultyChip: { borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  difficultyChipActive: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  difficultyChipText: { color: RydrColors.mute, fontSize: 12, textTransform: "capitalize" },
  difficultyChipTextActive: { color: RydrColors.onGold, fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
  switchLabel: { color: RydrColors.ink, fontSize: 14 },
  submitButton: { backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 28 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 15 },
});
