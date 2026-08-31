import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { DirectMessageOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

// Live delivery for DMs is REST-polled rather than WebSocket-pushed like
// ride group chat, matching the web client's DM thread implementation.
const POLL_INTERVAL_MS = 4000;

export default function DMThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessageOut[]>([]);
  const [otherName, setOtherName] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const listRef = useRef<FlatList>(null);

  const load = useCallback(async () => {
    if (!threadId) return;
    try {
      const [threads, history] = await Promise.all([
        api.listDMThreads(),
        api.getDMMessages(threadId, { limit: 50 }),
      ]);
      const thread = threads.threads.find((t) => t.id === threadId);
      if (thread) setOtherName(thread.other_user.name);
      setMessages(history.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load conversation");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !threadId) return;
    setDraft("");
    try {
      const msg = await api.sendDMMessage(threadId, body);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
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
      <Stack.Screen options={{ headerShown: true, title: otherName || "Message", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>{error || "No messages yet. Say hi!"}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.author.id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
                <View style={[styles.bubble, mine && styles.bubbleMine]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={RydrColors.mute}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendButton} onPress={send} disabled={!draft.trim()}>
            <Ionicons name="send" size={18} color={RydrColors.onGold} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: RydrColors.canvas },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: RydrColors.canvas },
  emptyText: { color: RydrColors.mute, fontSize: 13 },
  listContent: { padding: 16, gap: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: "row" },
  bubbleRowMine: { justifyContent: "flex-end" },
  bubble: { maxWidth: "78%", backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: RydrColors.gold, borderColor: RydrColors.gold },
  bubbleText: { color: RydrColors.ink, fontSize: 14 },
  bubbleTextMine: { color: RydrColors.onGold },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: RydrColors.hairline },
  input: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  sendButton: { backgroundColor: RydrColors.gold, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
