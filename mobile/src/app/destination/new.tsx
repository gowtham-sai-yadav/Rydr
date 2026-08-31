import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { TerrainDifficulty } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

const DIFFICULTIES: TerrainDifficulty[] = ["chill", "moderate", "rough"];

export default function SubmitDestinationScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [region, setRegion] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [difficulty, setDifficulty] = useState<TerrainDifficulty>("moderate");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      setError("Latitude and longitude must be numbers");
      return;
    }
    setSubmitting(true);
    try {
      const dest = await api.submitDestination({
        name: name.trim(),
        description: description.trim() || null,
        region: region.trim() || null,
        latitude: lat,
        longitude: lng,
        terrain_difficulty: difficulty,
      });
      router.replace(`/destination/${dest.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit destination");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Submit a Destination", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Nandi Hills" placeholderTextColor={RydrColors.mute} />

          <Text style={styles.label}>Region (optional)</Text>
          <TextInput style={styles.input} value={region} onChangeText={setRegion} placeholder="e.g. Karnataka" placeholderTextColor={RydrColors.mute} />

          <Text style={styles.label}>Description (optional)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="What makes this ride-worthy?"
            placeholderTextColor={RydrColors.mute}
          />

          <View style={styles.row}>
            <View style={styles.flexOne}>
              <Text style={styles.label}>Latitude</Text>
              <TextInput style={styles.input} value={latitude} onChangeText={setLatitude} keyboardType="numbers-and-punctuation" placeholder="13.370" placeholderTextColor={RydrColors.mute} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.label}>Longitude</Text>
              <TextInput style={styles.input} value={longitude} onChangeText={setLongitude} keyboardType="numbers-and-punctuation" placeholder="77.683" placeholderTextColor={RydrColors.mute} />
            </View>
          </View>

          <Text style={styles.label}>Terrain difficulty</Text>
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

          <TouchableOpacity style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.submitButtonText}>{submitting ? "Submitting..." : "Submit Destination"}</Text>
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
  difficultyRow: { flexDirection: "row", gap: 8 },
  difficultyChip: { borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  difficultyChipActive: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  difficultyChipText: { color: RydrColors.mute, fontSize: 12, textTransform: "capitalize" },
  difficultyChipTextActive: { color: RydrColors.onGold, fontWeight: "700" },
  submitButton: { backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 28 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 15 },
});
