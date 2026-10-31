import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, Check, Megaphone } from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../../src/api/client";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../../src/components/ui";
import { communicationsApi } from "../../../src/features/communicationsApi";
import { familyApi } from "../../../src/features/familyApi";
import { notificationRoute } from "../../../src/lib/notificationRoutes";
import { formatRelativeTime } from "../../../src/lib/formatRelativeTime";
import type { Notification } from "../../../src/types/models";
import { colors, radius } from "../../../src/theme/tokens";

export default function NotificationsScreen() {
  const client = useQueryClient();
  const router = useRouter();
  const [absence, setAbsence] = useState<{ studentId: string; date: string; detail: string } | null>(null);
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => communicationsApi.notifications(signal),
  });
  const notificationGroups = query.data ? groupNotificationsByDate(query.data) : [];
  const markRead = async (id: string) => {
    await communicationsApi.markRead(id);
    await client.invalidateQueries({ queryKey: ["notifications"] });
  };
  const openNotification = (item: Notification) => {
    if (!item.read_at) void markRead(item.id);
    if (item.type === "attendance_absent" && item.link) {
      const queryString = item.link.split("?")[1] ?? "";
      const params = new URLSearchParams(queryString);
      const studentId = params.get("student_id");
      const date = params.get("date");
      if (studentId && date) {
        setReason("");
        setAbsence({ studentId, date, detail: item.body });
        return;
      }
    }
    const route = notificationRoute(item.link);
    if (route) router.push(route);
  };
  const submitReason = async () => {
    const trimmed = reason.trim();
    if (!absence || trimmed.length < 10) {
      Alert.alert("Add a little more detail", "Please enter at least 10 characters for the reason.");
      return;
    }
    try {
      await familyApi.createRequest({
        topic: "absence",
        subject: `Absence explanation · ${absence.date}`,
        message: trimmed,
        student_id: absence.studentId,
      });
      setAbsence(null);
      setReason("");
      void client.invalidateQueries({ queryKey: ["family-requests"] });
      Alert.alert("Reason sent", "Your child’s absence explanation has been sent to the school.");
    } catch (error) {
      Alert.alert("Could not send reason", apiErrorMessage(error));
    }
  };
  return (
    <Screen
      safeAreaTop
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.blue}
        />
      }
    >
      <Heading
        title="Notifications"
        subtitle="Important messages sent to your account."
      />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Notifications unavailable"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title="You’re all caught up"
          body="School notifications sent to your account will appear here."
        />
      ) : (
        notificationGroups.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={styles.groupTitle}>{group.label}</Text>
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => openNotification(item)}
              >
                <Card style={{ ...styles.item, ...(item.read_at ? {} : styles.unread) }}>
                  <View style={styles.icon}>
                    <Bell size={17} color={colors.blue} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.head}>
                      <Text style={styles.title}>{item.title}</Text>
                      {!item.read_at ? <View style={styles.dot} /> : null}
                    </View>
                    <Text style={styles.body}>{item.body}</Text>
                    {item.type === "attendance_absent" ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => openNotification(item)}
                        style={styles.reasonButton}
                      >
                        <Text style={styles.reasonButtonText}>Send absence reason</Text>
                      </Pressable>
                    ) : null}
                    <Text style={styles.date}>{formatRelativeTime(item.created_at)}</Text>
                  </View>
                  {!item.read_at ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Mark notification as read"
                      onPress={() => void markRead(item.id)}
                      style={styles.read}
                    >
                      <Check size={16} color={colors.blue} />
                    </Pressable>
                  ) : null}
                </Card>
              </Pressable>
            ))}
          </View>
        ))
      )}
      <View style={styles.subhead}>
        <Megaphone size={16} color={colors.muted} />
        <Text style={styles.subtext}>
          School notices are listed in School updates.
        </Text>
      </View>
      <Modal visible={Boolean(absence)} transparent animationType="fade" onRequestClose={() => setAbsence(null)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.reasonModal}>
            <Text style={styles.modalEyebrow}>ATTENDANCE FOLLOW-UP</Text>
            <Text style={styles.modalTitle}>Share the reason for the absence</Text>
            <Text style={styles.modalBody}>{absence?.detail}</Text>
            <TextInput
              accessibilityLabel="Absence reason"
              multiline
              maxLength={1000}
              textAlignVertical="top"
              value={reason}
              onChangeText={setReason}
              placeholder="Write a short explanation for the school…"
              placeholderTextColor={colors.mutedLight}
              style={styles.reasonInput}
            />
            <Text style={styles.characterCount}>{reason.length}/1000</Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAbsence(null)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void submitReason()} style={styles.sendButton}>
                <Text style={styles.sendText}>Send to school</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

const GROUP_ORDER = ["Today", "Yesterday", "This week", "This month", "This year", "Older"] as const;

function groupNotificationsByDate(items: Notification[], now = new Date()) {
  const groups = new Map<string, Notification[]>();
  for (const item of items) {
    const date = new Date(item.created_at);
    const label = notificationDateGroup(date, now);
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => GROUP_ORDER.indexOf(left as (typeof GROUP_ORDER)[number]) - GROUP_ORDER.indexOf(right as (typeof GROUP_ORDER)[number]))
    .map(([label, groupItems]) => ({
      label,
      items: groupItems.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    }));
}

function notificationDateGroup(date: Date, now: Date): (typeof GROUP_ORDER)[number] {
  if (!Number.isFinite(date.getTime())) return "Older";
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (dateDay === today) return "Today";
  if (dateDay === today - oneDay) return "Yesterday";
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  if (dateDay >= weekStart.getTime() && dateDay < today - oneDay) return "This week";
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()) return "This month";
  if (date.getFullYear() === now.getFullYear()) return "This year";
  return "Older";
}

const styles = StyleSheet.create({
  group: { gap: 9 },
  groupTitle: { color: colors.ink, fontSize: 14, fontWeight: "800", marginTop: 4, marginBottom: 1 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
  },
  unread: { borderColor: "#C8DCFF", backgroundColor: "#FAFCFF" },
  icon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { color: colors.ink, fontWeight: "700", fontSize: 14, flex: 1 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
  },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  date: { color: colors.mutedLight, fontSize: 10, marginTop: 2 },
  read: { padding: 7 },
  reasonButton: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 5,
  },
  reasonButtonText: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(9, 25, 55, 0.48)",
  },
  reasonModal: {
    borderRadius: 24,
    padding: 22,
    backgroundColor: colors.surface,
    gap: 12,
  },
  modalEyebrow: { color: colors.blue, fontSize: 10, fontWeight: "800", letterSpacing: 1.1 },
  modalTitle: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 26 },
  modalBody: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  reasonInput: {
    minHeight: 130,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    color: colors.ink,
    fontSize: 14,
    backgroundColor: "#FBFDFF",
  },
  characterCount: { alignSelf: "flex-end", color: colors.mutedLight, fontSize: 11, marginTop: -7 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 2 },
  cancelButton: { paddingHorizontal: 15, paddingVertical: 12 },
  cancelText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  sendButton: { borderRadius: radius.pill, backgroundColor: colors.blue, paddingHorizontal: 17, paddingVertical: 12 },
  sendText: { color: "white", fontWeight: "700", fontSize: 13 },
  subhead: { flexDirection: "row", alignItems: "center", gap: 8 },
  subtext: { color: colors.muted, fontSize: 12 },
});
