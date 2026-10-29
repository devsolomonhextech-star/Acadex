import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Send, ShieldCheck, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme/tokens";
import {
  REQUEST_TOPICS,
  requestTopicById,
  type RequestTopicId,
} from "../../features/parentDesk";
import type { Child } from "../../types/models";
import { PressableScale } from "../insights/InsightVisuals";

export function RequestSheet({
  initialTopic,
  linkedChildren,
  defaultChildId,
  schoolName,
  onClose,
  onSubmit,
  submitting = false,
}: {
  initialTopic: RequestTopicId;
  linkedChildren: Child[];
  defaultChildId?: string | null;
  schoolName: string;
  onClose: () => void;
  submitting?: boolean;
  onSubmit: (input: {
    topicId: RequestTopicId;
    subject: string;
    message: string;
    childId: string | null;
  }) => void;
}) {
  const insets = useSafeAreaInsets();
  const [topicId, setTopicId] = useState<RequestTopicId>(initialTopic);
  const [childId, setChildId] = useState<string | null>(
    defaultChildId ?? linkedChildren[0]?.id ?? null,
  );
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<"subject" | "message" | null>(null);

  const submit = () => {
    if (subject.trim().length < 3) {
      setError("Add a short subject for your request.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Tell the school a little more about what you need.");
      return;
    }
    onSubmit({
      topicId,
      subject: subject.trim(),
      message: message.trim(),
      childId,
    });
  };

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable
            accessibilityLabel="Close request"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>New request</Text>
                <Text style={styles.subtitle}>
                  Send a note to {schoolName}.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.close}
              >
                <X size={17} color={colors.blueDeep} strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.labelRow}>
                <Text style={styles.label}>TOPIC</Text>
                <Text style={styles.selectedTopic}>
                  {requestTopicById(topicId).title}
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.topicRail}
              >
                {REQUEST_TOPICS.map((topic) => {
                  const Icon = topic.icon;
                  const active = topic.id === topicId;
                  return (
                    <Pressable
                      key={topic.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      onPress={() => setTopicId(topic.id)}
                      style={[
                        styles.topicChip,
                        active && styles.topicChipActive,
                      ]}
                    >
                      <Icon
                        size={14}
                        color={active ? colors.blue : topic.color}
                        strokeWidth={2.1}
                      />
                      <Text
                        style={[
                          styles.topicText,
                          active && styles.topicTextActive,
                        ]}
                      >
                        {topic.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {linkedChildren.length > 1 ? (
                <>
                  <Text style={styles.label}>ABOUT</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.childRail}
                  >
                    {linkedChildren.map((child) => {
                      const active = child.id === childId;
                      return (
                        <Pressable
                          key={child.id}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setChildId(child.id)}
                          style={[
                            styles.childChip,
                            active && styles.childChipActive,
                          ]}
                        >
                          <View
                            style={[
                              styles.childAvatar,
                              active && styles.childAvatarActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.childInitials,
                                active && styles.childInitialsActive,
                              ]}
                            >
                              {child.first_name[0]}
                              {child.last_name[0]}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.childName,
                              active && styles.childNameActive,
                            ]}
                          >
                            {child.first_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}

              <Text style={styles.label}>SUBJECT</Text>
              <View
                style={[
                  styles.inputWrap,
                  focused === "subject" && styles.inputWrapFocused,
                ]}
              >
                <TextInput
                  value={subject}
                  onChangeText={(value) => {
                    setSubject(value);
                    if (error) setError("");
                  }}
                  onFocus={() => setFocused("subject")}
                  onBlur={() => setFocused(null)}
                  placeholder="e.g. Absence on Friday"
                  placeholderTextColor={colors.mutedLight}
                  style={styles.input}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                />
              </View>

              <Text style={styles.label}>MESSAGE</Text>
              <View
                style={[
                  styles.inputWrap,
                  styles.messageWrap,
                  focused === "message" && styles.inputWrapFocused,
                ]}
              >
                <TextInput
                  value={message}
                  onChangeText={(value) => {
                    setMessage(value);
                    if (error) setError("");
                  }}
                  onFocus={() => setFocused("message")}
                  onBlur={() => setFocused(null)}
                  placeholder="Add the details your school will need. Include dates or names where helpful."
                  placeholderTextColor={colors.mutedLight}
                  style={[styles.input, styles.messageInput]}
                  multiline
                  textAlignVertical="top"
                  autoCapitalize="sentences"
                />
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <View style={styles.note}>
                <ShieldCheck size={14} color={colors.blue} strokeWidth={2.1} />
                <Text style={styles.noteText}>
                  Your request is shared only with your school.
                </Text>
              </View>
            </ScrollView>

            <PressableScale
              accessibilityLabel="Send request"
              disabled={submitting}
              onPress={submit}
              style={[styles.sendButton, submitting && styles.sendButtonBusy]}
            >
              <Text style={styles.sendText}>
                {submitting ? "Sending…" : "Send request"}
              </Text>
              {submitting ? null : (
                <Send size={16} color="#FFFFFF" strokeWidth={2.4} />
              )}
            </PressableScale>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 20, 45, 0.48)",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
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
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
  },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  title: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 8, paddingBottom: 10 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 3,
  },
  label: {
    color: colors.mutedLight,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1,
  },
  selectedTopic: {
    color: colors.blue,
    fontSize: 9,
    fontWeight: "800",
  },
  topicRail: { gap: 7, paddingRight: 16 },
  topicChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  topicChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  topicText: {
    color: colors.muted,
    fontSize: 10.5,
    fontWeight: "600",
  },
  topicTextActive: {
    color: colors.blue,
    fontWeight: "800",
  },
  childRail: { gap: 7, paddingRight: 16 },
  childChip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  childChipActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueSoft,
  },
  childAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#EAF0F8",
    alignItems: "center",
    justifyContent: "center",
  },
  childAvatarActive: { backgroundColor: colors.blue },
  childInitials: {
    color: colors.muted,
    fontSize: 8,
    fontWeight: "800",
  },
  childInitialsActive: { color: "#FFFFFF" },
  childName: {
    color: colors.ink,
    fontSize: 10.5,
    fontWeight: "600",
  },
  childNameActive: { color: colors.blue, fontWeight: "800" },
  inputWrap: {
    minHeight: 45,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#F8FBFF",
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  inputWrapFocused: {
    borderColor: colors.blue,
    backgroundColor: colors.surface,
    shadowColor: "#155EEF",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  input: {
    color: colors.ink,
    fontSize: 12.5,
    paddingVertical: 10,
  },
  messageWrap: {
    minHeight: 104,
    justifyContent: "flex-start",
  },
  messageInput: {
    minHeight: 96,
    paddingTop: 10,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 10,
    lineHeight: 14,
  },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    marginTop: 2,
  },
  noteText: {
    flex: 1,
    color: colors.blueDeep,
    fontSize: 9.5,
    lineHeight: 14,
  },
  sendButtonBusy: { opacity: 0.7 },
  sendButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: colors.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  sendText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
