import { useState } from "react";
import {
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
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function SettingsScreen() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [homeCity, setHomeCity] = useState(user?.home_city ?? "");
  const [isPrivate, setIsPrivate] = useState(user?.is_private ?? false);
  const [privacyRadius, setPrivacyRadius] = useState(String(user?.privacy_zone_radius_km ?? ""));
  const [serviceInterval, setServiceInterval] = useState(String(user?.bike?.service_interval_km ?? 3000));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [markingServiced, setMarkingServiced] = useState(false);

  const handleMarkServiced = async () => {
    setMarkingServiced(true);
    setError("");
    try {
      await api.markBikeServiced();
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark serviced");
    } finally {
      setMarkingServiced(false);
    }
  };

  const handleSave = async () => {
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      await api.updateMe({
        name,
        bio: bio || null,
        home_city: homeCity || null,
        is_private: isPrivate,
        privacy_zone_radius_km: privacyRadius ? parseFloat(privacyRadius) : null,
      });
      if (user?.bike) {
        await api.updateBike({ service_interval_km: serviceInterval ? parseInt(serviceInterval, 10) : undefined });
      }
      await refreshUser();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Settings & Privacy", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          {saved && (
            <View style={styles.savedBox}>
              <Text style={styles.savedText}>Saved</Text>
            </View>
          )}

          <Text style={styles.sectionHeading}>Profile</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor={RydrColors.mute} />

          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bio}
            onChangeText={setBio}
            multiline
            placeholder="Tell other riders about yourself"
            placeholderTextColor={RydrColors.mute}
          />

          <Text style={styles.label}>Home city</Text>
          <TextInput style={styles.input} value={homeCity} onChangeText={setHomeCity} placeholder="e.g. Bengaluru" placeholderTextColor={RydrColors.mute} />

          {user?.bike && (
            <>
              <Text style={styles.sectionHeading}>Bike & Gear</Text>
              <View style={styles.gearRow}>
                <Text style={styles.gearText}>
                  {user.bike.total_km_since_service.toFixed(0)} / {user.bike.service_interval_km} km since service
                </Text>
                <TouchableOpacity onPress={handleMarkServiced} disabled={markingServiced}>
                  <Text style={styles.gearAction}>{markingServiced ? "Saving..." : "Mark serviced"}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    user.bike.total_km_since_service >= user.bike.service_interval_km && styles.progressFillDue,
                    { width: `${Math.min(100, (user.bike.total_km_since_service / user.bike.service_interval_km) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.gearSub}>{user.bike.total_km_lifetime.toFixed(0)} km lifetime</Text>

              <Text style={styles.label}>Service interval (km)</Text>
              <TextInput style={styles.input} value={serviceInterval} onChangeText={setServiceInterval} keyboardType="number-pad" />
            </>
          )}

          <Text style={styles.sectionHeading}>Privacy & Safety</Text>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelBlock}>
              <Text style={styles.switchLabel}>Private account</Text>
              <Text style={styles.switchHint}>Followers must be approved before they can DM you or see private ride data.</Text>
            </View>
            <Switch value={isPrivate} onValueChange={setIsPrivate} trackColor={{ false: RydrColors.hairline, true: RydrColors.gold }} />
          </View>

          <Text style={styles.label}>Home privacy zone radius (km)</Text>
          <TextInput
            style={styles.input}
            value={privacyRadius}
            onChangeText={setPrivacyRadius}
            keyboardType="decimal-pad"
            placeholder="e.g. 1.5 — fuzzes GPS near home on shared tracks"
            placeholderTextColor={RydrColors.mute}
          />

          <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Changes"}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 4, paddingBottom: 60 },
  sectionHeading: { color: RydrColors.ink, fontWeight: "700", fontSize: 15, marginTop: 20, marginBottom: 4 },
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
  textArea: { minHeight: 70, textAlignVertical: "top" },
  errorBox: { borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, padding: 12, marginBottom: 8 },
  errorText: { color: RydrColors.red, fontSize: 12 },
  savedBox: { borderWidth: 1, borderColor: "rgba(16,185,129,0.35)", backgroundColor: "rgba(16,185,129,0.08)", borderRadius: 8, padding: 12, marginBottom: 8 },
  savedText: { color: RydrColors.green, fontSize: 12, fontWeight: "600" },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 },
  switchLabelBlock: { flex: 1 },
  switchLabel: { color: RydrColors.ink, fontSize: 14, fontWeight: "600" },
  switchHint: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  saveButton: { backgroundColor: RydrColors.gold, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 28 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 15 },
  gearRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  gearText: { color: RydrColors.ink, fontSize: 13, fontWeight: "600" },
  gearAction: { color: RydrColors.gold, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  progressTrack: { height: 6, backgroundColor: RydrColors.surfaceDeep, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", backgroundColor: RydrColors.gold },
  progressFillDue: { backgroundColor: RydrColors.red },
  gearSub: { color: RydrColors.mute, fontSize: 11, marginTop: 6 },
});
