import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import type { ReportOut, ReportStatus } from "@/lib/api.types";
import { RydrColors } from "@/constants/rydrTheme";

const STATUS_FILTERS: Array<{ value: ReportStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "reviewed", label: "Reviewed" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

export default function AdminReportsScreen() {
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<ReportOut[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("open");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = user?.is_admin === true;

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError("");
    try {
      const res = await api.listReports({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 50,
      });
      setReports(res.reports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin, statusFilter]);

  useEffect(() => {
    if (isAdmin) {
      load();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [isAdmin, authLoading, load]);

  const changeStatus = async (id: string, status: ReportStatus) => {
    setUpdatingId(id);
    setError("");
    try {
      const updated = await api.updateReport(id, { status });
      setReports((prev) => prev.map((r) => (r.id === id ? updated : r)));
      Alert.alert("Success", `Report status updated to ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update report status");
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case "open":
        return RydrColors.red;
      case "reviewed":
        return RydrColors.gold;
      case "actioned":
        return RydrColors.green;
      default:
        return RydrColors.mute;
    }
  };

  const renderItem = ({ item }: { item: ReportOut }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>TARGET:</Text>
            <Text style={styles.metaValue}>{item.target_type.toUpperCase()}</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: getStatusColor(item.status) }]}>
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.reasonText}>{item.reason}</Text>

        <View style={styles.divider} />

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Reporter ID:</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {item.reporter_id}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Target ID:</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {item.target_id}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date:</Text>
          <Text style={styles.detailValue}>
            {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <Text style={styles.actionsLabel}>Mark as:</Text>
          <View style={styles.actionButtons}>
            {(["reviewed", "actioned", "dismissed"] as ReportStatus[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.actionBtn,
                  item.status === s && styles.actionBtnActive,
                  updatingId === item.id && styles.actionBtnDisabled,
                ]}
                disabled={updatingId === item.id || item.status === s}
                onPress={() => changeStatus(item.id, s)}
              >
                <Text
                  style={[
                    styles.actionBtnText,
                    item.status === s && styles.actionBtnTextActive,
                  ]}
                >
                  {s.slice(0, 4).toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  };

  if (authLoading || loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={RydrColors.gold} />
      </SafeAreaView>
    );
  }

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.center}>
        <Ionicons name="shield-outline" size={48} color={RydrColors.red} />
        <Text style={styles.errorTitle}>Access Denied</Text>
        <Text style={styles.errorSub}>This interface is restricted to Rydr system administrators.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Moderation Queue",
          headerStyle: { backgroundColor: RydrColors.canvas },
          headerTintColor: RydrColors.ink,
        }}
      />

      {/* Filters bar */}
      <View style={styles.filtersContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
          {STATUS_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.filterTab, statusFilter === f.value && styles.filterTabActive]}
              onPress={() => setStatusFilter(f.value)}
            >
              <Text style={[styles.filterTabText, statusFilter === f.value && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBoxText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={reports}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          load();
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkbox-outline" size={32} color={RydrColors.stone} />
            <Text style={styles.emptyText}>All clear! No reports found.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas, padding: 32 },
  errorTitle: { color: RydrColors.ink, fontSize: 16, fontWeight: "700", marginTop: 16, uppercase: true } as any,
  errorSub: { color: RydrColors.mute, fontSize: 13, textAlign: "center", marginTop: 8, lineHeight: 18 },
  filtersContainer: { borderBottomWidth: 1, borderColor: RydrColors.hairline, paddingVertical: 10, backgroundColor: RydrColors.surfaceDeep },
  filtersScroll: { paddingHorizontal: 12, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: RydrColors.hairline, backgroundColor: RydrColors.canvas },
  filterTabActive: { borderColor: RydrColors.gold, backgroundColor: "rgba(245,158,11,0.08)" },
  filterTabText: { color: RydrColors.mute, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  filterTabTextActive: { color: RydrColors.gold },
  listContent: { padding: 16, gap: 16 },
  errorBox: { marginHorizontal: 16, borderWidth: 1, borderColor: "rgba(239,68,68,0.35)", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 12, padding: 12 },
  errorBoxText: { color: RydrColors.red, fontSize: 12 },
  card: { backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 16, padding: 16, gap: 10 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaLabel: { color: RydrColors.mute, fontSize: 10, fontWeight: "700" },
  metaValue: { color: RydrColors.ink, fontSize: 11, fontWeight: "800" },
  statusBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 9, fontWeight: "800" },
  reasonText: { color: RydrColors.ink, fontSize: 13, fontWeight: "500", lineHeight: 20, marginVertical: 4 },
  divider: { height: 1, backgroundColor: RydrColors.hairline },
  detailRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  detailLabel: { color: RydrColors.mute, fontSize: 10, fontWeight: "600" },
  detailValue: { color: RydrColors.ash, fontSize: 10, flex: 1, textAlign: "right" },
  actionsContainer: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderColor: RydrColors.hairline },
  actionsLabel: { color: RydrColors.mute, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  actionButtons: { flexDirection: "row", gap: 6, flex: 1, justifyContent: "flex-end" },
  actionBtn: { borderWidth: 1, borderColor: RydrColors.hairlineStrong, backgroundColor: RydrColors.surfaceDeep, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  actionBtnActive: { borderColor: RydrColors.gold, backgroundColor: "rgba(245,158,11,0.05)" },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: RydrColors.mute, fontSize: 9, fontWeight: "800" },
  actionBtnTextActive: { color: RydrColors.gold },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 10 },
  emptyText: { color: RydrColors.stone, fontSize: 13, fontWeight: "600" },
});
