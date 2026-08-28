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
import { useRouter } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function ProfileScreen() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  if (loading || !user) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <AnniversaryBanner createdAt={user.created_at} />

        <View style={styles.headerCard}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{user.name?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <Text style={styles.name}>{user.name}</Text>
          {!!user.home_city && <Text style={styles.city}>{user.home_city}</Text>}

          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.stat} onPress={() => router.push(`/user/${user.id}/followers`)}>
              <Text style={styles.statNumber}>{user.followers_count}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => router.push(`/user/${user.id}/following`)}>
              <Text style={styles.statNumber}>{user.following_count}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.menu}>
          <MenuRow icon="trophy-outline" label="Leaderboard" onPress={() => router.push("/leaderboard")} />
          <MenuRow icon="people-outline" label="Clubs" onPress={() => router.push("/club")} />
          <MenuRow icon="calendar-outline" label="Events" onPress={() => router.push("/event")} />
          <MenuRow icon="ribbon-outline" label="Badges & Achievements" onPress={() => router.push("/profile/badges")} />
          <MenuRow icon="stats-chart-outline" label="Personal Records" onPress={() => router.push("/profile/records")} />
          <MenuRow icon="flash-outline" label="Best Efforts" onPress={() => router.push("/profile/best-efforts")} />
          <MenuRow icon="gift-outline" label="Year in Rydr" onPress={() => router.push("/profile/year-in-rydr")} />
          <MenuRow icon="map-outline" label="My Trips" onPress={() => router.push("/trip")} />
          <MenuRow icon="images-outline" label="Photo Timeline" onPress={() => router.push("/profile/timeline")} />
          <MenuRow icon="flame-outline" label="Ridden Ground" onPress={() => router.push("/heatmap")} />
          <MenuRow icon="mail-outline" label="Follow Requests" onPress={() => router.push("/profile/follow-requests")} />
          <MenuRow icon="notifications-outline" label="Inbox & Alerts" onPress={() => router.push("/notifications")} />
          {user.is_admin && (
            <MenuRow icon="shield-outline" label="Moderation Queue" onPress={() => router.push("/admin/reports")} />
          )}
          <MenuRow icon="settings-outline" label="Settings & Privacy" onPress={() => router.push("/profile/settings")} />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={RydrColors.red} />
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <Ionicons name={icon} size={18} color={RydrColors.mute} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={RydrColors.mute} style={styles.menuChevron} />
    </TouchableOpacity>
  );
}

// No scheduler/cron infra exists in this stack to push a real reminder
// notification on the actual day, so this is a lightweight computed
// banner instead, matching the web app's same approach.
function AnniversaryBanner({ createdAt }: { createdAt: string }) {
  const joined = new Date(createdAt);
  const now = new Date();
  const isAnniversary = joined.getMonth() === now.getMonth() && joined.getDate() === now.getDate();
  const years = now.getFullYear() - joined.getFullYear();

  if (!isAnniversary || years < 1) return null;

  return (
    <View style={styles.anniversaryBanner}>
      <Text style={styles.anniversaryText}>
        🎉 {years} year{years === 1 ? "" : "s"} on Rydr today — happy Rydr-versary!
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  container: { padding: 16, gap: 16, paddingBottom: 32 },
  anniversaryBanner: { borderWidth: 1, borderColor: "rgba(245,158,11,0.3)", backgroundColor: "rgba(245,158,11,0.1)", borderRadius: 12, padding: 12, alignItems: "center" },
  anniversaryText: { color: RydrColors.gold, fontSize: 13, fontWeight: "700", textAlign: "center" },
  headerCard: {
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  avatar: { width: 72, height: 72, borderRadius: 36, marginBottom: 12 },
  avatarPlaceholder: { backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: RydrColors.ink, fontWeight: "700", fontSize: 26 },
  name: { color: RydrColors.ink, fontWeight: "800", fontSize: 18 },
  city: { color: RydrColors.mute, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 16 },
  stat: { alignItems: "center" },
  statNumber: { color: RydrColors.ink, fontWeight: "700", fontSize: 16 },
  statLabel: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  menu: {
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 14,
    overflow: "hidden",
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: RydrColors.hairline,
  },
  menuLabel: { color: RydrColors.ink, fontSize: 14, flex: 1 },
  menuChevron: { marginLeft: "auto" },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
    borderRadius: 12,
    paddingVertical: 14,
  },
  logoutText: { color: RydrColors.red, fontWeight: "700", fontSize: 14 },
});
