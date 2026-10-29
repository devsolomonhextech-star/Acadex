import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Inbox,
  MessageSquareText,
  Phone,
  Plus,
  Sparkles,
  X,
} from "lucide-react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  FloatingOrb,
  PressableScale,
} from "../../../src/components/insights/InsightVisuals";
import { RequestSheet } from "../../../src/components/parentDesk/RequestSheet";
import { RequestThreadSheet } from "../../../src/components/parentDesk/RequestThreadSheet";
import { apiErrorMessage } from "../../../src/api/client";
import {
  REQUEST_STATUS,
  REQUEST_TOPICS,
  formatRequestTimestamp,
  requestTopicById,
  type RequestTopicId,
} from "../../../src/features/parentDesk";
import { familyApi } from "../../../src/features/familyApi";
import type { ParentRequestSummary } from "../../../src/types/models";
import { useAuth } from "../../../src/services/auth";
import { useChildren } from "../../../src/services/parentData";
import { colors } from "../../../src/theme/tokens";
import type { ReactNode } from "react";

const PAGE = "#F4F8FD";

export default function ParentDeskScreen() {
  const insets = useSafeAreaInsets();
  const { parent } = useAuth();
  const { children, selectedChild } = useChildren();
  const client = useQueryClient();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTopic, setSheetTopic] = useState<RequestTopicId>("other");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestsQuery = useQuery({
    queryKey: ["family-requests"],
    queryFn: ({ signal }) => familyApi.requests(signal),
  });
  const requests = requestsQuery.data?.items ?? [];
  const unreadCount = requestsQuery.data?.counts.unread ?? 0;

  const createRequest = useMutation({
    mutationFn: (input: {
      topicId: RequestTopicId;
      subject: string;
      message: string;
      childId: string | null;
    }) =>
      familyApi.createRequest({
        topic: input.topicId,
        subject: input.subject,
        message: input.message,
        student_id: input.childId,
      }),
    onSuccess: () => {
      setSheetOpen(false);
      setSent(true);
      void client.invalidateQueries({ queryKey: ["family-requests"] });
    },
    onError: (error) =>
      Alert.alert("Request not sent", apiErrorMessage(error), [{ text: "OK" }]),
  });

  const schoolName = parent?.school_name ?? "your school";

  const openSheet = (topic: RequestTopicId = "other") => {
    setSheetTopic(topic);
    setSheetOpen(true);
  };

  const submitRequest = (input: {
    topicId: RequestTopicId;
    subject: string;
    message: string;
    childId: string | null;
  }) => createRequest.mutate(input);

  const showHelp = () => {
    Alert.alert(
      "Contact your school",
      `Reach ${schoolName} directly for urgent or sensitive matters. Parent Desk is best for non-urgent follow-ups and requests.`,
      [{ text: "Got it" }],
    );
  };

  const openThread = (requestId: string) => setThreadId(requestId);

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={requestsQuery.isRefetching}
            onRefresh={() => void requestsQuery.refetch()}
            tintColor={colors.blue}
          />
        }
      >
        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
          <View style={styles.hero}>
            <LinearGradient
              colors={["#0A2E7A", "#155EEF", "#3B96FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FloatingOrb
              style={styles.heroOrbLarge}
              distance={9}
              duration={5600}
            />
            <FloatingOrb
              style={styles.heroOrbSmall}
              distance={-7}
              duration={4700}
            />
            <View pointerEvents="none" style={styles.heroArt}>
              <View style={styles.heroArtRing} />
              <MessageSquareText
                size={38}
                color="rgba(255,255,255,0.9)"
                strokeWidth={1.7}
              />
              <View style={styles.heroArtDot} />
            </View>
            <Text style={styles.heroTitle}>How can we help?</Text>
            <Text style={styles.heroBody}>
              Send a request to {schoolName}. Track every reply in one place.
            </Text>
            <PressableScale
              accessibilityLabel="Create a new request"
              onPress={() => openSheet()}
              style={styles.newButton}
            >
              <View style={styles.newIcon}>
                <Plus size={14} color={colors.blue} strokeWidth={2.8} />
              </View>
              <Text style={styles.newText}>New request</Text>
              <ArrowUpRight size={15} color={colors.blue} strokeWidth={2.4} />
            </PressableScale>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(120).duration(400)}>
          <SectionHeading
            title="Start a request"
            subtitle="Pick a topic to reach the right team."
          />
          <View style={styles.topicGrid}>
            {REQUEST_TOPICS.map((topic, index) => {
              const Icon = topic.icon;
              return (
                <Animated.View
                  key={topic.id}
                  entering={FadeInUp.delay(150 + index * 35).duration(300)}
                  style={styles.topicCell}
                >
                  <PressableScale
                    accessibilityLabel={topic.title}
                    onPress={() => openSheet(topic.id)}
                    style={styles.topicCard}
                  >
                    <View style={styles.topicTop}>
                      <View
                        style={[
                          styles.topicIcon,
                          { backgroundColor: topic.soft },
                        ]}
                      >
                        <Icon size={17} color={topic.color} strokeWidth={2.1} />
                      </View>
                      <ChevronRight
                        size={14}
                        color={colors.mutedLight}
                        strokeWidth={2.2}
                      />
                    </View>
                    <Text style={styles.topicTitle} numberOfLines={1}>
                      {topic.title}
                    </Text>
                    <Text style={styles.topicSubtitle}>{topic.subtitle}</Text>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(220).duration(400)}>
          <SectionHeading
            title="Your requests"
            subtitle="Replies and updates live here."
            right={
              <View style={styles.countPill}>
                <Text style={styles.countText}>
                  {requests.length} sent{unreadCount ? ` · ${unreadCount} new` : ""}
                </Text>
              </View>
            }
          />

          {sent ? (
            <Animated.View
              entering={FadeInDown.duration(300)}
              style={styles.sentCard}
            >
              <View style={styles.sentIcon}>
                <Check size={14} color={colors.success} strokeWidth={3} />
              </View>
              <View style={styles.sentCopy}>
                <Text style={styles.sentTitle}>Request sent</Text>
                <Text style={styles.sentBody}>
                  Your school will reply in Parent Desk.
                </Text>
              </View>
              <PressableScale
                accessibilityLabel="Dismiss confirmation"
                onPress={() => setSent(false)}
                style={styles.sentClose}
              >
                <X size={13} color={colors.success} strokeWidth={2.4} />
              </PressableScale>
            </Animated.View>
          ) : null}

          {requestsQuery.isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.blue} />
              <Text style={styles.loadingText}>Loading your requests…</Text>
            </View>
          ) : requests.length ? (
            <View style={styles.requestList}>
              {requests.map((request, index) => (
                <Animated.View
                  key={request.id}
                  entering={FadeInUp.delay(index * 50).duration(300)}
                >
                  <RequestCard
                    request={request}
                    onPress={() => openThread(request.id)}
                  />
                </Animated.View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Inbox size={25} color={colors.blue} strokeWidth={1.9} />
              </View>
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptyBody}>
                Choose a topic above to start a conversation with your school.
              </Text>
              <PressableScale
                accessibilityLabel="Start a request"
                onPress={() => openSheet()}
                style={styles.emptyButton}
              >
                <Text style={styles.emptyButtonText}>Start a request</Text>
                <ChevronRight size={14} color={colors.blue} strokeWidth={2.4} />
              </PressableScale>
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(280).duration(400)}>
          <View style={styles.howCard}>
            <View style={styles.howHeader}>
              <View style={styles.howIcon}>
                <Sparkles size={17} color={colors.blue} strokeWidth={2.1} />
              </View>
              <View style={styles.howCopy}>
                <Text style={styles.howTitle}>How it works</Text>
                <Text style={styles.howSubtitle}>
                  A simple path to a reply.
                </Text>
              </View>
            </View>
            {[
              {
                title: "Choose a topic",
                body: "Tell us what the request is about.",
              },
              {
                title: "Add the details",
                body: "Include dates, names or anything helpful.",
              },
              {
                title: "Hear back from school",
                body: "Replies and updates appear under Your requests.",
              },
            ].map((step, index) => (
              <View key={step.title} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  {index < 2 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(330).duration(400)}>
          <PressableScale
            accessibilityLabel="Contact your school"
            onPress={showHelp}
            style={styles.contactCard}
          >
            <View style={styles.contactIcon}>
              <Phone size={18} color={colors.blue} strokeWidth={2.1} />
            </View>
            <View style={styles.contactCopy}>
              <Text style={styles.contactTitle}>Need to speak to someone?</Text>
              <Text style={styles.contactBody}>
                Contact your school office directly for urgent matters.
              </Text>
            </View>
            <ChevronRight size={17} color={colors.blue} strokeWidth={2.2} />
          </PressableScale>
        </Animated.View>
      </ScrollView>

      {sheetOpen ? (
        <RequestSheet
          initialTopic={sheetTopic}
          linkedChildren={children}
          defaultChildId={selectedChild?.id}
          schoolName={schoolName}
          submitting={createRequest.isPending}
          onClose={() => setSheetOpen(false)}
          onSubmit={submitRequest}
        />
      ) : null}

      {threadId ? (
        <RequestThreadSheet
          requestId={threadId}
          onClose={() => setThreadId(null)}
        />
      ) : null}
    </View>
  );
}

function SectionHeading({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

function RequestCard({
  request,
  onPress,
}: {
  request: ParentRequestSummary;
  onPress: () => void;
}) {
  const topic = requestTopicById(request.topic);
  const status = REQUEST_STATUS[request.status];
  const Icon = topic.icon;
  return (
    <PressableScale
      accessibilityLabel={`Open request ${request.subject}`}
      onPress={onPress}
      style={styles.requestCard}
    >
      <View style={styles.requestTop}>
        <View style={[styles.requestIcon, { backgroundColor: topic.soft }]}>
          <Icon size={17} color={topic.color} strokeWidth={2.1} />
        </View>
        <Text style={[styles.requestTopic, { color: topic.color }]}>
          {topic.title.toUpperCase()}
        </Text>
        {request.unread ? <View style={styles.unreadDot} /> : null}
        <ChevronRight size={15} color={colors.mutedLight} strokeWidth={2.2} />
      </View>
      <Text style={styles.requestSubject} numberOfLines={1}>
        {request.subject}
      </Text>
      <Text style={styles.requestMessage} numberOfLines={2}>
        {request.last_message_by === "school" ? "School: " : "You: "}
        {request.preview}
      </Text>
      <View style={styles.requestFooter}>
        <Text style={styles.requestMeta} numberOfLines={1}>
          {request.student_name ?? "General request"} ·{" "}
          {formatRequestTimestamp(request.last_message_at)} ·{" "}
          {request.message_count} message{request.message_count === 1 ? "" : "s"}
        </Text>
        <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: status.fg }]} />
          <Text style={[styles.statusText, { color: status.fg }]}>
            {status.short}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 30,
    gap: 18,
  },
  hero: {
    borderRadius: 24,
    padding: 17,
    overflow: "hidden",
    shadowColor: "#062A73",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroOrbLarge: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -74,
    right: -48,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    bottom: -36,
    left: -24,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  heroArt: {
    position: "absolute",
    right: 18,
    top: 52,
    width: 88,
    height: 88,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroArtRing: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  heroArtDot: {
    position: "absolute",
    right: 16,
    top: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#7FF0C4",
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 13,
    maxWidth: 240,
  },
  heroBody: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
    maxWidth: 238,
  },
  newButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 11,
    paddingRight: 13,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    marginTop: 13,
  },
  newIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  newText: {
    color: colors.blue,
    fontSize: 11.5,
    fontWeight: "800",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 1 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  topicGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  topicCell: { width: "48.5%" },
  topicCard: {
    minHeight: 96,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  topicTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  topicIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  topicTitle: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 8,
  },
  topicSubtitle: {
    color: colors.muted,
    fontSize: 8.5,
    marginTop: 2,
  },
  countPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
    marginBottom: 2,
  },
  countText: {
    color: colors.blueDeep,
    fontSize: 9,
    fontWeight: "800",
  },
  sentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 11,
    borderRadius: 13,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "#CDEBDD",
    marginBottom: 10,
  },
  sentIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  sentCopy: { flex: 1, minWidth: 0, gap: 1 },
  sentTitle: {
    color: colors.success,
    fontSize: 10.5,
    fontWeight: "800",
  },
  sentBody: {
    color: "#4D7868",
    fontSize: 9,
  },
  sentClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  requestList: { gap: 10 },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 30,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadingText: { color: colors.muted, fontSize: 10.5 },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E46D55",
  },
  requestCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  requestTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  requestIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  requestTopic: {
    flex: 1,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  requestSubject: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: "800",
    marginTop: 8,
  },
  requestMessage: {
    color: colors.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 2,
  },
  requestFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 8,
  },
  requestMeta: {
    flex: 1,
    color: colors.mutedLight,
    fontSize: 8.5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.blueSoft,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.blue,
  },
  statusText: {
    color: colors.blue,
    fontSize: 8.5,
    fontWeight: "800",
  },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 26,
    paddingHorizontal: 20,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: "center",
    maxWidth: 260,
    marginTop: 3,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 10,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  emptyButtonText: {
    color: colors.blue,
    fontSize: 10.5,
    fontWeight: "800",
  },
  howCard: {
    padding: 15,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  howHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 12,
  },
  howIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  howCopy: { flex: 1, minWidth: 0, gap: 1 },
  howTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  howSubtitle: {
    color: colors.muted,
    fontSize: 10,
  },
  step: { flexDirection: "row", gap: 10 },
  stepRail: { width: 24, alignItems: "center" },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    color: colors.blue,
    fontSize: 10,
    fontWeight: "800",
  },
  stepLine: {
    flex: 1,
    width: 1.5,
    backgroundColor: "#DCE8FA",
    marginVertical: 3,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 12,
    gap: 1,
  },
  stepTitle: {
    color: colors.ink,
    fontSize: 11.5,
    fontWeight: "700",
    marginTop: 2,
  },
  stepBody: {
    color: colors.muted,
    fontSize: 9.5,
    lineHeight: 14,
  },
  contactCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E9FC",
  },
  contactIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  contactCopy: { flex: 1, minWidth: 0, gap: 2 },
  contactTitle: {
    color: colors.blueDeep,
    fontSize: 11.5,
    fontWeight: "800",
  },
  contactBody: {
    color: "#5C7BA6",
    fontSize: 9.5,
    lineHeight: 14,
  },
});
