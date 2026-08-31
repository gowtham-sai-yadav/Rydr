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
import { chatGroupWsUrl } from "@/lib/ws";
import { ChatMessageOut } from "@/lib/api.types";
import { useAuth } from "@/context/AuthContext";
import { RydrColors } from "@/constants/rydrTheme";

export default function ChatRoomScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { user } = useAuth();
  const [groupName, setGroupName] = useState("");
  const [messages, setMessages] = useState<ChatMessageOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<FlatList>(null);

  const appendMessage = useCallback((msg: ChatMessageOut) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;

    (async () => {
      try {
        const [group, history] = await Promise.all([
          api.getChatGroup(groupId),
          api.getChatMessages(groupId, { limit: 50 }),
        ]);
        if (cancelled) return;
        setGroupName(group.name);
        setMessages(history.messages);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load chat");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    (async () => {
      const url = await chatGroupWsUrl(groupId);
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onmessage = (event) => {
        try {
          appendMessage(JSON.parse(event.data) as ChatMessageOut);
        } catch {
          // ignore malformed frames
        }
      };
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [groupId, appendMessage]);

  const send = () => {
    const body = draft.trim();
    if (!body || !groupId) return;
    setDraft("");
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ body }));
    } else {
      api.sendChatMessage(groupId, body).then(appendMessage).catch(() => setError("Failed to send message"));
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
      <Stack.Screen options={{ headerShown: true, title: groupName || "Chat", headerStyle: { backgroundColor: RydrColors.canvas }, headerTintColor: RydrColors.ink }} />
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
                  {!mine && <Text style={styles.authorName}>{item.author.name}</Text>}
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
  authorName: { color: RydrColors.gold, fontSize: 10, fontWeight: "700", marginBottom: 2 },
  bubbleText: { color: RydrColors.ink, fontSize: 14 },
  bubbleTextMine: { color: RydrColors.onGold },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: RydrColors.hairline },
  input: { flex: 1, backgroundColor: RydrColors.surfaceCard, borderWidth: 1, borderColor: RydrColors.hairline, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: RydrColors.ink, fontSize: 14 },
  sendButton: { backgroundColor: RydrColors.gold, width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
