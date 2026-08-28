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

export default function SignupScreen() {
  const { signup } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [bikeName, setBikeName] = useState("");
  const [bikeModel, setBikeModel] = useState("");
  const [bikeYear, setBikeYear] = useState("");

  const goToStep2 = () => {
    setError("");
    if (!name || !email || !password) {
      setError("Name, email, and password are required");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      await signup({
        name,
        email,
        phone: phone || null,
        password,
        bike_name: bikeName || null,
        bike_model: bikeModel || null,
        bike_year: bikeYear ? parseInt(bikeYear, 10) : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Rydr</Text>
        <Text style={styles.tagline}>Create an account to start planning rides.</Text>

        <View style={styles.card}>
          <Text style={styles.heading}>{step === 1 ? "Your details" : "Your bike (optional)"}</Text>

          {!!error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {step === 1 ? (
            <>
              <Text style={styles.label}>Name</Text>
              <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={RydrColors.mute} />

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

              <Text style={styles.label}>Phone (optional)</Text>
              <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91..." placeholderTextColor={RydrColors.mute} />

              <Text style={styles.label}>Password</Text>
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" placeholderTextColor={RydrColors.mute} />

              <TouchableOpacity style={styles.button} onPress={goToStep2}>
                <Text style={styles.buttonText}>Continue</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Bike Name (optional)</Text>
              <TextInput style={styles.input} value={bikeName} onChangeText={setBikeName} placeholder="e.g. Thunder" placeholderTextColor={RydrColors.mute} />

              <Text style={styles.label}>Bike Model (optional)</Text>
              <TextInput style={styles.input} value={bikeModel} onChangeText={setBikeModel} placeholder="e.g. Royal Enfield Himalayan" placeholderTextColor={RydrColors.mute} />

              <Text style={styles.label}>Bike Year (optional)</Text>
              <TextInput style={styles.input} value={bikeYear} onChangeText={setBikeYear} keyboardType="number-pad" placeholder="e.g. 2022" placeholderTextColor={RydrColors.mute} />

              <View style={styles.row}>
                <TouchableOpacity style={styles.buttonSecondary} onPress={() => setStep(1)}>
                  <Text style={styles.buttonSecondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.flexOne, loading && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>{loading ? "Creating..." : "Create Account"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <Link href="/(auth)/login" style={styles.footerLink}>
            <Text style={styles.footerText}>
              Already have an account? <Text style={styles.footerLinkText}>Sign in</Text>
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
  row: { flexDirection: "row", gap: 12, marginTop: 4 },
  flexOne: { flex: 1 },
  button: {
    backgroundColor: RydrColors.gold,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 14 },
  buttonSecondary: {
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    marginTop: 4,
  },
  buttonSecondaryText: { color: RydrColors.mute, fontWeight: "600", fontSize: 14 },
  footerLink: { marginTop: 20, alignSelf: "center" },
  footerText: { color: RydrColors.mute, fontSize: 13 },
  footerLinkText: { color: RydrColors.gold, fontWeight: "600" },
});
