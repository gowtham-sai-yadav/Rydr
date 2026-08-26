import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { PostOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";
import { useRouter } from "expo-router";

export default function FeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.getFeed({ limit: 30 });
      setPosts(res.posts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const toggleLike = async (post: PostOut) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, liked_by_me: !p.liked_by_me, like_count: p.like_count + (p.liked_by_me ? -1 : 1) }
          : p,
      ),
    );
    try {
      if (post.liked_by_me) await api.unlikePost(post.id);
      else await api.likePost(post.id);
    } catch {
      load();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>Feed</Text>
        <TouchableOpacity onPress={() => router.push("/notifications")} style={styles.bellBtn}>
          <Ionicons name="notifications-outline" size={22} color={RydrColors.ink} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={RydrColors.gold} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>{error || "No posts yet. Follow riders to see their rides here."}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              {item.author.avatar_url ? (
                <Image source={{ uri: item.author.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{item.author.name?.[0]?.toUpperCase() ?? "?"}</Text>
                </View>
              )}
              <Text style={styles.authorName}>{item.author.name}</Text>
            </View>

            {item.media.length > 0 && (
              <Image source={{ uri: item.media[0].url }} style={styles.postImage} resizeMode="cover" />
            )}

            {!!item.caption && <Text style={styles.caption}>{item.caption}</Text>}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item)}>
                <Ionicons
                  name={item.liked_by_me ? "heart" : "heart-outline"}
                  size={20}
                  color={item.liked_by_me ? RydrColors.red : RydrColors.mute}
                />
                <Text style={styles.actionText}>{item.like_count}</Text>
              </TouchableOpacity>
              <View style={styles.actionButton}>
                <Ionicons name="chatbubble-outline" size={18} color={RydrColors.mute} />
                <Text style={styles.actionText}>{item.comment_count}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas, padding: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  headerText: { fontSize: 22, fontWeight: "800", color: RydrColors.ink },
  bellBtn: { padding: 4 },
  listContent: { paddingHorizontal: 16, paddingBottom: 24, gap: 16 },
  emptyText: { color: RydrColors.mute, textAlign: "center", fontSize: 14 },
  card: {
    backgroundColor: RydrColors.surfaceCard,
    borderWidth: 1,
    borderColor: RydrColors.hairline,
    borderRadius: 14,
    overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: { backgroundColor: RydrColors.hairline, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: RydrColors.ink, fontWeight: "700", fontSize: 13 },
  authorName: { color: RydrColors.ink, fontWeight: "600", fontSize: 14 },
  postImage: { width: "100%", height: 220, backgroundColor: RydrColors.surfaceDeep },
  caption: { color: RydrColors.ink, fontSize: 13, paddingHorizontal: 12, paddingTop: 10 },
  actionsRow: { flexDirection: "row", gap: 20, padding: 12 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { color: RydrColors.mute, fontSize: 13 },
});
