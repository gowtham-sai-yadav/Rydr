import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { api } from "@/lib/api";
import { UserBadgeOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

const RARITY_COLORS: Record<string, string> = {
  common: RydrColors.mute,
  uncommon: RydrColors.green,
  rare: RydrColors.blue,
  epic: RydrColors.orange,
  legendary: RydrColors.gold,
};

export default function BadgesScreen() {
  const { user } = useAuth();
  const [badges, setBadges] = useState<UserBadgeOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api
      .listUserBadges(user.id)
      .then(setBadges)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load badges"))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: "Badges", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={RydrColors.gold} />
        </View>
      ) : (
        <FlatList
          data={badges}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No badges earned yet. Go ride!"}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const rarity = item.badge?.rarity ?? "common";
            const color = RARITY_COLORS[rarity] ?? RydrColors.mute;
            return (
              <View style={[styles.card, { borderColor: color }]}>
                <View style={[styles.iconCircle, { borderColor: color }]}>
                  <Ionicons name="ribbon" size={24} color={color} />
                </View>
                <Text style={styles.badgeName} numberOfLines={2}>{item.badge?.name}</Text>
                <Text style={[styles.rarity, { color }]}>{rarity}</Text>
                <Text style={styles.badgeDescription} numberOfLines={2}>{item.badge?.description}</Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyText: { color: RydrColors.mute, fontSize: 14, textAlign: "center" },
  listContent: { padding: 12, gap: 12 },
  row: { gap: 12 },
  card: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1.5, borderRadius: 14, padding: 14, alignItems: "center", gap: 4 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  badgeName: { color: RydrColors.ink, fontWeight: "700", fontSize: 13, textAlign: "center" },
  rarity: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  badgeDescription: { color: RydrColors.mute, fontSize: 10, textAlign: "center", marginTop: 4 },
});
