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
import { Link } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Rydr</Text>
        <Text style={styles.tagline}>Scouted Trails. Logged Journeys. Ride Joined.</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>Welcome back</Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={RydrColors.mute}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={RydrColors.mute}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? "Signing in..." : "Sign In"}</Text>
          </TouchableOpacity>

          <Link href="/(auth)/signup" style={styles.footerLink}>
            <Text style={styles.footerText}>
              Don&apos;t have an account? <Text style={styles.footerLinkText}>Sign up</Text>
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  container: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  brand: { fontSize: 42, fontWeight: "800", color: RydrColors.gold, marginBottom: 6 },
  tagline: {
    color: RydrColors.mute,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 32,
    textAlign: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 16,
    padding: 24,
  },
  heading: { fontSize: 20, fontWeight: "700", color: RydrColors.ink, marginBottom: 20 },
  errorBox: {
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    backgroundColor: "rgba(239,68,68,0.08)",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: { color: RydrColors.red, fontSize: 12 },
  label: {
    color: RydrColors.mute,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  input: {
    backgroundColor: RydrColors.surfaceDeep,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: RydrColors.ink,
    fontSize: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: RydrColors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 14 },
  footerLink: { marginTop: 20, alignSelf: "center" },
  footerText: { color: RydrColors.mute, fontSize: 13 },
  footerLinkText: { color: RydrColors.gold, fontWeight: "600" },
});
