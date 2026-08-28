import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/lib/api";
import { ClubBadgeOut, ClubChallengeOut, ClubLeaderboardEntry, ClubMemberOut, ClubOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

type Tab = "members" | "leaderboard" | "badges" | "challenges";

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [club, setClub] = useState<ClubOut | null>(null);
  const [members, setMembers] = useState<ClubMemberOut[]>([]);
  const [leaderboard, setLeaderboard] = useState<ClubLeaderboardEntry[]>([]);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const [badges, setBadges] = useState<ClubBadgeOut[]>([]);
  const [challenges, setChallenges] = useState<ClubChallengeOut[]>([]);
  const [tab, setTab] = useState<Tab>("members");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [badgeSlug, setBadgeSlug] = useState("");
  const [badgeName, setBadgeName] = useState("");
  const [badgeDescription, setBadgeDescription] = useState("");
  const [creatingBadge, setCreatingBadge] = useState(false);

  const [challengeTitle, setChallengeTitle] = useState("");
  const [challengeGoalKm, setChallengeGoalKm] = useState("");
  const [challengeStart, setChallengeStart] = useState("");
  const [challengeEnd, setChallengeEnd] = useState("");
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, m] = await Promise.all([api.getClub(id), api.listClubMembers(id)]);
      setClub(c);
      setMembers(m.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load club");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    if (tab === "leaderboard") api.getClubLeaderboard(id, period).then((res) => setLeaderboard(res.entries)).catch(() => {});
    else if (tab === "badges") api.listClubBadges(id).then(setBadges).catch(() => {});
    else if (tab === "challenges") api.listClubChallenges(id).then((res) => setChallenges(res.challenges)).catch(() => {});
  }, [tab, id, period]);

  const handleJoinToggle = async () => {
    if (!club) return;
    setBusy(true);
    try {
      if (club.is_member) await api.leaveClub(club.id);
      else await api.joinClub(club.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update membership");
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = club?.my_role === "admin";

  const handleCreateBadge = async () => {
    if (!id || !badgeSlug.trim() || !badgeName.trim() || !badgeDescription.trim()) return;
    setCreatingBadge(true);
    try {
      await api.createClubBadge(id, { slug: badgeSlug.trim(), name: badgeName.trim(), description: badgeDescription.trim() });
      setBadgeSlug("");
      setBadgeName("");
      setBadgeDescription("");
      const res = await api.listClubBadges(id);
      setBadges(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create badge");
    } finally {
      setCreatingBadge(false);
    }
  };

  const handleCreateChallenge = async () => {
    const goal = parseFloat(challengeGoalKm);
    if (!id || !challengeTitle.trim() || Number.isNaN(goal) || !challengeStart || !challengeEnd) return;
    setCreatingChallenge(true);
    try {
      await api.createClubChallenge(id, { title: challengeTitle.trim(), goal_km: goal, start_date: challengeStart, end_date: challengeEnd });
      setChallengeTitle("");
      setChallengeGoalKm("");
      setChallengeStart("");
      setChallengeEnd("");
      const res = await api.listClubChallenges(id);
      setChallenges(res.challenges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create challenge");
    } finally {
      setCreatingChallenge(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!club) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errorText}>{error || "Club not found"}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen options={{ headerShown: true, title: club.name, headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />

      <View style={styles.header}>
        {club.city && <Text style={styles.city}>{club.city}</Text>}
        {club.description && <Text style={styles.description}>{club.description}</Text>}
        <View style={styles.headerRow}>
          <Text style={styles.memberCount}>{club.member_count} members</Text>
          <TouchableOpacity style={[styles.joinButton, club.is_member && styles.joinButtonActive]} onPress={handleJoinToggle} disabled={busy}>
            <Text style={[styles.joinButtonText, club.is_member && styles.joinButtonTextActive]}>{club.is_member ? "Leave" : "Join"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabRow}>
        {(["members", "leaderboard", "badges", "challenges"] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tabItem, tab === t && styles.tabItemActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "members" && (
        <FlatList
          data={members}
          keyExtractor={(m) => m.user.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{item.user.name.charAt(0)}</Text></View>
              <Text style={styles.rowName}>{item.user.name}</Text>
              {item.role === "admin" && <Text style={styles.adminBadge}>Admin</Text>}
            </TouchableOpacity>
          )}
        />
      )}

      {tab === "leaderboard" && (
        <>
          <View style={styles.periodRow}>
            {(["week", "month"] as const).map((p) => (
              <TouchableOpacity key={p} style={[styles.periodChip, period === p && styles.periodChipActive]} onPress={() => setPeriod(p)}>
                <Text style={[styles.periodChipText, period === p && styles.periodChipTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <FlatList
            data={leaderboard}
            keyExtractor={(e) => e.user.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.emptyText}>No distance logged this {period} yet.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => router.push(`/user/${item.user.id}`)}>
                <Text style={styles.rank}>#{item.rank}</Text>
                <View style={styles.avatar}><Text style={styles.avatarText}>{item.user.name.charAt(0)}</Text></View>
                <Text style={styles.rowName}>{item.user.name}</Text>
                <Text style={styles.distance}>{item.distance_km.toFixed(0)} km</Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {tab === "badges" && (
        <FlatList
          data={badges}
          keyExtractor={(b) => b.id}
          numColumns={2}
          columnWrapperStyle={styles.badgeRow}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No custom badges yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.badgeCard}>
              <Text style={styles.badgeName}>{item.name}</Text>
              <Text style={styles.badgeDescription}>{item.description}</Text>
            </View>
          )}
          ListFooterComponent={
            isAdmin ? (
              <View style={styles.adminForm}>
                <Text style={styles.adminFormLabel}>New club badge</Text>
                <TextInput style={styles.adminInput} value={badgeSlug} onChangeText={setBadgeSlug} placeholder="slug (e.g. century-rider)" placeholderTextColor={RydrColors.mute} />
                <TextInput style={styles.adminInput} value={badgeName} onChangeText={setBadgeName} placeholder="Name" placeholderTextColor={RydrColors.mute} />
                <TextInput style={styles.adminInput} value={badgeDescription} onChangeText={setBadgeDescription} placeholder="Description" placeholderTextColor={RydrColors.mute} />
                <TouchableOpacity style={styles.adminSubmit} onPress={handleCreateBadge} disabled={creatingBadge}>
                  <Text style={styles.adminSubmitText}>{creatingBadge ? "Creating..." : "Create badge"}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}

      {tab === "challenges" && (
        <FlatList
          data={challenges}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No challenges running.</Text>}
          renderItem={({ item }) => (
            <View style={styles.challengeCard}>
              <View style={styles.headerRow}>
                <Text style={styles.challengeTitle}>{item.title}</Text>
                {item.is_complete && <Text style={styles.completeBadge}>Complete</Text>}
              </View>
              <Text style={styles.challengeDates}>{item.start_date} → {item.end_date}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, item.is_complete && styles.progressFillComplete, { width: `${Math.min(100, (item.progress_km / item.goal_km) * 100)}%` }]} />
              </View>
              <Text style={styles.challengeProgress}>{item.progress_km.toFixed(0)} / {item.goal_km} km</Text>
            </View>
          )}
          ListFooterComponent={
            isAdmin ? (
              <View style={styles.adminForm}>
                <Text style={styles.adminFormLabel}>New challenge</Text>
                <TextInput style={styles.adminInput} value={challengeTitle} onChangeText={setChallengeTitle} placeholder="Title" placeholderTextColor={RydrColors.mute} />
                <TextInput style={styles.adminInput} value={challengeGoalKm} onChangeText={setChallengeGoalKm} keyboardType="numeric" placeholder="Goal (km)" placeholderTextColor={RydrColors.mute} />
                <View style={styles.adminRow}>
                  <TextInput style={[styles.adminInput, styles.flexOne]} value={challengeStart} onChangeText={setChallengeStart} placeholder="Start YYYY-MM-DD" placeholderTextColor={RydrColors.mute} />
                  <TextInput style={[styles.adminInput, styles.flexOne]} value={challengeEnd} onChangeText={setChallengeEnd} placeholder="End YYYY-MM-DD" placeholderTextColor={RydrColors.mute} />
                </View>
                <TouchableOpacity style={styles.adminSubmit} onPress={handleCreateChallenge} disabled={creatingChallenge}>
                  <Text style={styles.adminSubmitText}>{creatingChallenge ? "Creating..." : "Create challenge"}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas, padding: 24 },
  errorText: { color: RydrColors.mute, fontSize: 14 },
  emptyText: { color: RydrColors.mute, fontSize: 13, textAlign: "center", padding: 16 },
  header: { padding: 16, gap: 6 },
  city: { color: RydrColors.mute, fontSize: 13 },
  description: { color: RydrColors.ink, fontSize: 13 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  memberCount: { color: RydrColors.mute, fontSize: 12 },
  joinButton: { backgroundColor: RydrColors.gold, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  joinButtonActive: { backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairline },
  joinButtonText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 12 },
  joinButtonTextActive: { color: RydrColors.ink },
  tabRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 12 },
  tabItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  tabItemActive: { backgroundColor: RydrColors.hairline },
  tabText: { color: RydrColors.mute, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  tabTextActive: { color: RydrColors.ink },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 10, padding: 10 },
  rank: { color: RydrColors.mute, fontSize: 12, fontWeight: "700", width: 24, textAlign: "center" },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarText: { color: RydrColors.ink, fontWeight: "700", fontSize: 12 },
  rowName: { color: RydrColors.ink, fontSize: 13, fontWeight: "600", flex: 1 },
  adminBadge: { color: RydrColors.gold, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  distance: { color: RydrColors.gold, fontSize: 12, fontWeight: "700" },
  periodRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
  periodChip: { backgroundColor: RydrColors.surfaceCard, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  periodChipActive: { backgroundColor: RydrColors.gold },
  periodChipText: { color: RydrColors.mute, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  periodChipTextActive: { color: RydrColors.onGold },
  badgeRow: { gap: 10 },
  badgeCard: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 12, alignItems: "center" },
  badgeName: { color: RydrColors.ink, fontWeight: "700", fontSize: 12, textAlign: "center" },
  badgeDescription: { color: RydrColors.mute, fontSize: 10, textAlign: "center", marginTop: 4 },
  challengeCard: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14 },
  challengeTitle: { color: RydrColors.ink, fontWeight: "700", fontSize: 14 },
  completeBadge: { color: RydrColors.green, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  challengeDates: { color: RydrColors.mute, fontSize: 11, marginTop: 2 },
  progressTrack: { height: 6, backgroundColor: RydrColors.surfaceDeep, borderRadius: 3, overflow: "hidden", marginTop: 8 },
  progressFill: { height: "100%", backgroundColor: RydrColors.gold },
  progressFillComplete: { backgroundColor: RydrColors.green },
  challengeProgress: { color: RydrColors.mute, fontSize: 11, marginTop: 4 },
  adminForm: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 12, padding: 14, gap: 8, marginTop: 4 },
  adminFormLabel: { color: RydrColors.mute, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  adminInput: { backgroundColor: RydrColors.surfaceDeep, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, color: RydrColors.ink, fontSize: 13 },
  adminRow: { flexDirection: "row", gap: 8 },
  flexOne: { flex: 1 },
  adminSubmit: { backgroundColor: RydrColors.gold, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  adminSubmitText: { color: RydrColors.onGold, fontWeight: "700", fontSize: 12 },
});
