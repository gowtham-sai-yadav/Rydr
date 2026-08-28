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
import { UserOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user: me, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setError("");
    try {
      const p = await api.getUser(id);
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const isSelf = me?.id === id;

  const handleFollow = async () => {
    if (!profile || isSelf) return;
    setBusy(true);
    setError("");
    const wasFollowed = profile.is_followed_by_me;
    const wasPending = profile.has_pending_follow_request;
    try {
      if (wasFollowed || wasPending) {
        await api.unfollowUser(profile.id);
        setProfile({
          ...profile,
          is_followed_by_me: false,
          has_pending_follow_request: false,
          followers_count: wasFollowed ? profile.followers_count - 1 : profile.followers_count,
        });
      } else if (profile.is_private) {
        await api.followUser(profile.id);
        await load();
      } else {
        await api.followUser(profile.id);
        setProfile({ ...profile, is_followed_by_me: true, followers_count: profile.followers_count + 1 });
      }
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update follow");
    } finally {
      setBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const thread = await api.openDMThread(profile.id);
      router.push(`/chat/dm/${thread.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open conversation");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVerified = async () => {
    if (!profile) return;
    setVerifying(true);
    setError("");
    try {
      const updated = await api.setVerifiedRider(profile.id, !profile.is_verified_rider);
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update verification");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "User not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: profile.name, headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerCard}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{profile.name?.[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={styles.name}>{profile.name}</Text>
            {profile.is_verified_rider && <Ionicons name="checkmark-circle" size={16} color={RydrColors.blue} />}
          </View>
          {me?.is_admin && !isSelf && (
            <TouchableOpacity onPress={handleToggleVerified} disabled={verifying}>
              <Text style={styles.verifyToggle}>
                {verifying ? "..." : profile.is_verified_rider ? "Revoke verified rider" : "Grant verified rider"}
              </Text>
            </TouchableOpacity>
          )}
          {!!profile.home_city && <Text style={styles.city}>{profile.home_city}</Text>}
          {!!profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

          <View style={styles.statsRow}>
            <TouchableOpacity style={styles.stat} onPress={() => router.push(`/user/${profile.id}/followers`)}>
              <Text style={styles.statNumber}>{profile.followers_count}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stat} onPress={() => router.push(`/user/${profile.id}/following`)}>
              <Text style={styles.statNumber}>{profile.following_count}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={styles.errorInline}>{error}</Text>}

          {!isSelf && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.followButton, (profile.is_followed_by_me || profile.has_pending_follow_request) && styles.followButtonActive]}
                onPress={handleFollow}
                disabled={busy}
              >
                <Text style={[styles.followButtonText, (profile.is_followed_by_me || profile.has_pending_follow_request) && styles.followButtonTextActive]}>
                  {profile.is_followed_by_me ? "Following" : profile.has_pending_follow_request ? "Requested" : profile.is_private ? "Request to follow" : "Follow"}
                </Text>
              </TouchableOpacity>
              {profile.is_followed_by_me && (
                <TouchableOpacity style={styles.messageButton} onPress={handleMessage} disabled={busy}>
                  <Ionicons name="chatbubble-outline" size={16} color={RydrColors.gold} />
                  <Text style={styles.messageButtonText}>Message</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  container: { padding: 16 },
  headerCard: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 16, padding: 20, alignItems: "center" },
  avatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  avatarPlaceholder: { backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: RydrColors.ink, fontWeight: "700", fontSize: 28 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  verifyToggle: { color: RydrColors.blue, fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginTop: 4 },
  name: { color: RydrColors.ink, fontWeight: "800", fontSize: 18 },
  city: { color: RydrColors.mute, fontSize: 12, marginTop: 2 },
  bio: { color: RydrColors.ink, fontSize: 13, textAlign: "center", marginTop: 8 },
  statsRow: { flexDirection: "row", gap: 32, marginTop: 16 },
  stat: { alignItems: "center" },
  statNumber: { color: RydrColors.ink, fontWeight: "700", fontSize: 16 },
  statLabel: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  errorInline: { color: RydrColors.red, fontSize: 12, marginTop: 10 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 18, width: "100%" },
  followButton: { flex: 1, borderWidth: 1, borderColor: RydrColors.gold, backgroundColor: RydrColors.gold, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  followButtonActive: { backgroundColor: "transparent" },
  followButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 13 },
  followButtonTextActive: { color: RydrColors.gold },
  messageButton: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, paddingVertical: 12 },
  messageButtonText: { color: RydrColors.gold, fontWeight: "600", fontSize: 13 },
  errorText: { color: RydrColors.red, fontSize: 14 },
});
