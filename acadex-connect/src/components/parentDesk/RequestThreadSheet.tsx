import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Send } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiErrorMessage } from "../../api/client";
import {
  REQUEST_STATUS,
  formatMessageTime,
  requestTopicById,
} from "../../features/parentDesk";
import { familyApi } from "../../features/familyApi";
import { colors } from "../../theme/tokens";
import { PressableScale } from "../insights/InsightVisuals";

export function RequestThreadSheet({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef<ScrollViewInstance>(null);

  const query = useQuery({
    queryKey: ["family-request", requestId],
    queryFn: ({ signal }) => familyApi.request(requestId, signal),
  });

  // Opening the thread clears its unread marker on the server.
  useEffect(() => {
    if (!query.data) return;
    void client.invalidateQueries({ queryKey: ["family-requests"] });
    void client.invalidateQueries({ queryKey: ["notifications"] });
  }, [query.data?.id, client, query.data]);

  const send = useMutation({
    mutationFn: (body: string) => familyApi.replyToRequest(requestId, body),
    onSuccess: (updated) => {
      client.setQueryData(["family-request", requestId], updated);
      setReply("");
      setError("");
      void client.invalidateQueries({ queryKey: ["family-requests"] });
      void client.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (cause) => setError(apiErrorMessage(cause)),
  });

  const detail = query.data;
  const topic = detail ? requestTopicById(detail.topic) : null;
  const status = detail ? REQUEST_STATUS[detail.status] : null;
  const canSend = reply.trim().length >= 2 && !send.isPending;

  const submit = () => {
    if (reply.trim().length < 2) {
      setError("Write a short reply before sending.");
      return;
    }
    send.mutate(reply.trim());
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close request" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Pressable onPress={onClose} style={styles.back} accessibilityLabel="Back">
              <ArrowLeft size={18} color={colors.ink} strokeWidth={2.3} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {detail?.subject ?? "Your request"}
              </Text>
              <Text style={styles.headerSub}>
                {detail
                  ? `${topic?.title ?? "Request"} · ${detail.reference}`
                  : "Loading conversation…"}
              </Text>
            </View>
            {status ? (
              <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.fg }]}>{status.label}</Text>
              </View>
            ) : null}
          </View>

          {query.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.blue} />
            </View>
          ) : query.isError ? (
            <View style={styles.center}>
              <AlertCircle size={22} color={colors.danger ?? "#C4453D"} strokeWidth={2} />
              <Text style={styles.errorText}>{apiErrorMessage(query.error)}</Text>
              <PressableScale
                accessibilityLabel="Retry loading the request"
                onPress={() => void query.refetch()}
                style={styles.retry}
              >
                <Text style={styles.retryText}>Try again</Text>
              </PressableScale>
            </View>
          ) : (
            <ScrollView
              ref={scrollRef}
              style={styles.messages}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: false })
              }
            >
              {detail?.messages.map((entry) => {
                const mine = entry.author_role === "parent";
                return (
                  <View
                    key={entry.id}
                    style={[styles.messageRow, mine && styles.messageRowMine]}
                  >
                    {!mine ? (
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {entry.author_name
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")
                            .toUpperCase()}
                        </Text>
                      </View>
                    ) : null}
                    <View style={[styles.bubble, mine && styles.bubbleMine]}>
                      <Text style={[styles.bubbleAuthor, mine && styles.bubbleAuthorMine]}>
                        {mine ? "You" : entry.author_name}
                      </Text>
                      <Text style={[styles.bubbleBody, mine && styles.bubbleBodyMine]}>
                        {entry.body}
                      </Text>
                      <Text style={[styles.bubbleTime, mine && styles.bubbleTimeMine]}>
                        {formatMessageTime(entry.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {detail?.status === "resolved" ? (
                <View style={styles.resolvedNote}>
                  <Text style={styles.resolvedText}>
                    This request is resolved. Replying reopens it for the school.
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          )}

          <View style={styles.composer}>
            {error ? <Text style={styles.composerError}>{error}</Text> : null}
            <View style={styles.composerRow}>
              <View style={styles.inputWrap}>
                <TextInput
                  value={reply}
                  onChangeText={(value) => {
                    setReply(value);
                    if (error) setError("");
                  }}
                  placeholder="Write a reply to your school…"
                  placeholderTextColor={colors.mutedLight}
                  style={styles.input}
                  multiline
                  maxLength={4000}
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
              </View>
              <PressableScale
                accessibilityLabel="Send reply"
                disabled={!canSend}
                onPress={submit}
                style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              >
                {send.isPending ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Send size={17} color="#FFFFFF" strokeWidth={2.4} />
                )}
              </PressableScale>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(7, 20, 45, 0.48)" },
  sheet: {
    maxHeight: "90%",
    minHeight: 360,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#E3EAF4",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5FB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 2 },
  headerTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  headerSub: { color: colors.muted, fontSize: 9.5 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 8.5, fontWeight: "800", letterSpacing: 0.2 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 40 },
  errorText: { color: colors.muted, fontSize: 11, textAlign: "center", maxWidth: 250 },
  retry: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
  },
  retryText: { color: colors.blue, fontSize: 11, fontWeight: "800" },
  messages: { flex: 1, minHeight: 120 },
  messagesContent: { gap: 10, paddingVertical: 4, paddingBottom: 12 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 7 },
  messageRowMine: { justifyContent: "flex-end" },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.blue, fontSize: 8.5, fontWeight: "800" },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    backgroundColor: "#F3F7FD",
    borderWidth: 1,
    borderColor: "#E4EDF7",
    gap: 3,
  },
  bubbleMine: {
    backgroundColor: "#155EEF",
    borderColor: "#155EEF",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 4,
  },
  bubbleAuthor: { color: colors.blueDeep, fontSize: 9, fontWeight: "800" },
  bubbleAuthorMine: { color: "rgba(255,255,255,0.82)" },
  bubbleBody: { color: colors.ink, fontSize: 11.5, lineHeight: 16.5 },
  bubbleBodyMine: { color: "#FFFFFF" },
  bubbleTime: { color: colors.mutedLight, fontSize: 8 },
  bubbleTimeMine: { color: "rgba(255,255,255,0.7)" },
  resolvedNote: {
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
    marginTop: 4,
  },
  resolvedText: { color: "#3C7A63", fontSize: 9.5, fontWeight: "600" },
  composer: { paddingTop: 8, borderTopWidth: 1, borderTopColor: "#EFF3F9" },
  composerError: { color: "#C4453D", fontSize: 10, marginBottom: 6 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  inputWrap: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E4EDF7",
    backgroundColor: "#F7FAFE",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  input: { color: colors.ink, fontSize: 11.5, lineHeight: 16, maxHeight: 96 },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { backgroundColor: "#A9C2E8" },
});
