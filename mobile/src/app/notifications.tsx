import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { api } from "@/lib/api";
import type { NotificationOut } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api.getNotifications({ page: 1, limit: 50 });
      setNotifications(res.notifications);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch {
      // Non-blocking fallback
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: new Date().toISOString() }))
      );
    } catch {
      // Non-blocking fallback
    }
  };

  const handlePressNotification = async (item: NotificationOut) => {
    if (!item.read_at) {
      await handleMarkRead(item.id);
    }

    // Navigate to target details
    if (item.ride_plan_id) {
      router.push(`/ride/${item.ride_plan_id}`);
    } else if (item.post_id) {
      router.push("/(tabs)/feed");
    } else if (item.badge_id) {
      router.push("/(tabs)/profile");
    } else if (item.type === "dm_received" && item.actor_id) {
      try {
        const thread = await api.openDMThread(item.actor_id);
        router.push(`/chat/dm/${thread.id}`);
      } catch {
        // Actor may have unfollowed since - nothing sensible to open.
      }
    } else if (item.type === "follow_requested") {
      router.push("/profile/follow-requests");
    } else if (item.type === "follow_accepted" && item.actor_id) {
      router.push(`/user/${item.actor_id}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "ride_join_requested":
        return "people";
      case "ride_join_approved":
        return "checkmark-circle";
      case "ride_join_rejected":
        return "close-circle";
      case "post_liked":
        return "heart";
      case "post_commented":
        return "chatbubble";
      case "badge_earned":
        return "trophy";
      case "dm_received":
        return "chatbubble-ellipses";
      case "follow_requested":
        return "person-add";
      case "follow_accepted":
        return "people";
      default:
        return "notifications";
    }
  };

  const getIconColor = (type: string, isRead: boolean) => {
    if (isRead) return RydrColors.mute;
    switch (type) {
      case "ride_join_approved":
      case "badge_earned":
        return RydrColors.gold;
      case "post_liked":
        return RydrColors.red;
      case "ride_join_requested":
      case "post_commented":
        return RydrColors.blue;
      default:
        return RydrColors.ink;
    }
  };

  const renderItem = ({ item }: { item: NotificationOut }) => {
    const isRead = !!item.read_at;
    return (
      <TouchableOpacity
        style={[styles.itemRow, !isRead && styles.itemRowUnread]}
        onPress={() => handlePressNotification(item)}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name={getIcon(item.type) as any}
            size={18}
            color={getIconColor(item.type, isRead)}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.messageText, !isRead && styles.messageTextUnread]}>
            {item.message}
          </Text>
          <Text style={styles.timeText}>
            {new Date(item.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </View>
        {!isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
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
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Inbox",
          headerStyle: { backgroundColor: RydrColors.canvas },
          headerTintColor: RydrColors.ink,
        }}
      />
      <View style={styles.headerBar}>
        <Text style={styles.subtitle}>Alerts & Notifications</Text>
        {notifications.some((n) => !n.read_at) && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        )}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load();
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-off-outline" size={32} color={RydrColors.stone} />
            <Text style={styles.emptyText}>Your inbox is empty</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  headerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: RydrColors.hairline },
  subtitle: { color: RydrColors.mute, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  markAllText: { color: RydrColors.gold, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  listContent: { paddingBottom: 20 },
  errorBox: { margin: 16, borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, padding: 12 },
  errorBoxText: { color: RydrColors.red, fontSize: 12 },
  itemRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: RydrColors.hairline, gap: 12 },
  itemRowUnread: { backgroundColor: "rgba(245,158,11,0.02)" },
  iconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: RydrColors.surfaceDeep, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: RydrColors.hairline },
  textContainer: { flex: 1, gap: 3 },
  messageText: { color: RydrColors.mute, fontSize: 12, lineHeight: 18 },
  messageTextUnread: { color: RydrColors.ink, fontWeight: "600" },
  timeText: { color: RydrColors.stone, fontSize: 10 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RydrColors.gold },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyText: { color: RydrColors.stone, fontSize: 13, fontWeight: "600" },
});
