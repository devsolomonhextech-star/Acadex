import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  MoreHorizontal,
  TrendingUp,
  Trophy,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState, LoadingState } from "../../../../src/components/ui";
import {
  ProgressRing,
  StatBadge,
  SubjectBadge,
  TrendChart,
} from "../../../../src/components/academics/AcademicVisuals";
import {
  academicColors,
  activityStatus,
  avatarTone,
  childName,
  formatActivityDate,
  initialsFor,
  progressTone,
  progressTrack,
  recentActivities,
  subjectPerformance,
  subjectTone,
  summariseActivities,
  weeklyTrend,
  type SubjectPerformance,
} from "../../../../src/features/academics";
import { familyApi } from "../../../../src/features/familyApi";
import { useChildren } from "../../../../src/services/parentData";
import type {
  DailyActivity,
  ReportSummary,
  TermReportCard,
} from "../../../../src/types/models";

type TabKey = "overview" | "subjects" | "reports";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "subjects", label: "Subjects" },
  { key: "reports", label: "Reports" },
];

export default function ChildAcademicsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { children, isLoading: childrenLoading } = useChildren();
  const [tab, setTab] = useState<TabKey>("overview");
  const [weeks, setWeeks] = useState(4);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  const index = children.findIndex((item) => item.id === studentId);
  const child = index >= 0 ? children[index] : null;

  const activities = useQuery({
    queryKey: ["activities", studentId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      familyApi.activities(studentId, signal),
    enabled: !!studentId,
  });
  const reports = useQuery({
    queryKey: ["reports", studentId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      familyApi.reports(studentId, signal),
    enabled: !!studentId,
  });
  const latestReport = reports.data?.[0];
  const reportCard = useQuery({
    queryKey: ["report-card", studentId, latestReport?.term_id],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      familyApi.report(
        studentId,
        latestReport!.term_id,
        signal,
      ) as Promise<TermReportCard>,
    enabled: !!studentId && !!latestReport?.term_id,
  });

  const summary = useMemo(
    () => (child ? summariseActivities(child, activities.data ?? []) : null),
    [activities.data, child],
  );
  const subjects = useMemo(
    () =>
      summary
        ? subjectPerformance(
            summary.activities,
            reportCard.data as TermReportCard | undefined,
          )
        : [],
    [reportCard.data, summary],
  );
  const recent = useMemo(
    () => recentActivities(activities.data ?? []),
    [activities.data],
  );
  const trend = useMemo(
    () => weeklyTrend(activities.data ?? [], weeks),
    [activities.data, weeks],
  );

  const tone = avatarTone(Math.max(index, 0));
  const displayName = childName(child);
  const firstName = child?.first_name ?? "there";
  const loading = activities.isLoading && !activities.data;
  const failure = activities.error && !activities.data;
  const refreshing =
    activities.isRefetching || reports.isRefetching || reportCard.isRefetching;

  const refresh = () => {
    void activities.refetch();
    void reports.refetch();
    if (latestReport?.term_id) void reportCard.refetch();
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/(tabs)/academics");
  };

  const changeTab = (next: TabKey) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const openReport = (termId?: string) => {
    const id = termId ?? latestReport?.term_id;
    if (!child || !id) {
      changeTab("reports");
      return;
    }
    router.push({
      pathname: "/(parent)/report-cards/[studentId]/[termId]",
      params: { studentId: child.id, termId: id },
    });
  };

  const showChildDetails = () => {
    Alert.alert(
      displayName,
      [
        `Class: ${child?.class_name || "Not assigned"}`,
        `Admission No: ${child?.admission_number ?? "—"}`,
        "",
        `Overall progress: ${summary?.percent ?? 0}%`,
      ].join("\n"),
      [{ text: "Close", style: "cancel" }],
    );
  };

  const showActivity = (activity: DailyActivity) => {
    const status = activityStatus(activity);
    const score =
      activity.score_percent != null
        ? `${Math.round(activity.score_percent)}%`
        : "Not recorded";
    Alert.alert(
      activity.title,
      [
        activity.subject_name,
        `Due: ${formatActivityDate(activity.due_on)}`,
        `Status: ${status.label}`,
        `Score: ${score}`,
      ].join("\n"),
      [{ text: "Close", style: "cancel" }],
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to academics"
          hitSlop={8}
          onPress={goBack}
          style={styles.back}
        >
          <ArrowLeft size={23} color={academicColors.ink} strokeWidth={2.3} />
        </Pressable>
        <View
          style={[styles.headerAvatar, { backgroundColor: tone.background }]}
        >
          <Text style={[styles.headerInitials, { color: tone.foreground }]}>
            {initialsFor(child)}
          </Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.headerName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.headerClass} numberOfLines={1}>
            {child?.class_name || "Class not assigned"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Student details"
          hitSlop={8}
          onPress={showChildDetails}
          style={styles.more}
        >
          <MoreHorizontal
            size={22}
            color={academicColors.ink}
            strokeWidth={2.4}
          />
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={academicColors.blue}
          />
        }
      >
        {childrenLoading && !child ? (
          <LoadingState />
        ) : !child ? (
          <EmptyState
            title="Student not found"
            body="This child is not linked to your parent account."
          />
        ) : loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={academicColors.blue} />
          </View>
        ) : failure ? (
          <EmptyState
            title="Performance could not load"
            body="Check your connection and try again."
            retry={() => void activities.refetch()}
          />
        ) : summary ? (
          <>
            <Animated.View entering={FadeInDown.duration(300)}>
              <View style={styles.overallCard}>
                <View style={styles.overallLeft}>
                  <ProgressRing
                    size={94}
                    strokeWidth={8}
                    progress={summary.percent}
                    color={progressTone(summary.percent)}
                    trackColor={progressTrack(summary.percent)}
                    label={`${summary.percent}%`}
                    labelSize={21.5}
                  />
                  <Text style={styles.overallLabel}>Overall Progress</Text>
                </View>
                <View style={styles.overallDivider} />
                <View style={styles.overallStats}>
                  <OverallStat
                    tone="green"
                    count={summary.completed}
                    label="Completed"
                    icon={<Check size={15} color="#FFFFFF" strokeWidth={3.4} />}
                  />
                  <OverallStat
                    tone="amber"
                    count={summary.pending}
                    label="Pending"
                    icon={
                      <Clock3 size={15} color="#FFFFFF" strokeWidth={2.4} />
                    }
                  />
                  <OverallStat
                    tone="red"
                    count={summary.overdue}
                    label="Overdue"
                    icon={
                      <CircleAlert
                        size={15}
                        color="#FFFFFF"
                        strokeWidth={2.5}
                      />
                    }
                  />
                </View>
              </View>
            </Animated.View>

            <View style={styles.segments}>
              {TABS.map((item) => {
                const active = tab === item.key;
                return (
                  <Pressable
                    key={item.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => changeTab(item.key)}
                    style={[
                      styles.segment,
                      active ? styles.segmentActive : styles.segmentIdle,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active
                          ? styles.segmentTextActive
                          : styles.segmentTextIdle,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {tab === "overview" ? (
              <Animated.View
                key="overview"
                entering={FadeInDown.duration(260)}
                style={styles.tabContent}
              >
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View
                      style={[styles.cardIcon, { backgroundColor: "#EAF2FF" }]}
                    >
                      <TrendingUp
                        size={18}
                        color={academicColors.blue}
                        strokeWidth={2.2}
                      />
                    </View>
                    <View style={styles.cardHeading}>
                      <Text style={styles.cardTitle}>Performance Trend</Text>
                      <Text style={styles.cardSubtitle}>Weekly progress</Text>
                    </View>
                    <View style={styles.rangeWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Showing the last ${weeks} weeks`}
                        onPress={() => setRangeOpen((value) => !value)}
                        style={styles.rangePill}
                      >
                        <Text style={styles.rangeText}>Last {weeks} weeks</Text>
                        <ChevronDown
                          size={14}
                          color={academicColors.blueDeep}
                          strokeWidth={2.4}
                        />
                      </Pressable>
                      {rangeOpen ? (
                        <View style={styles.rangeMenu}>
                          {[4, 8, 12].map((option) => (
                            <Pressable
                              key={option}
                              onPress={() => {
                                setWeeks(option);
                                setRangeOpen(false);
                              }}
                              style={[
                                styles.rangeOption,
                                option === weeks && styles.rangeOptionActive,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.rangeOptionText,
                                  option === weeks &&
                                    styles.rangeOptionTextActive,
                                ]}
                              >
                                Last {option} weeks
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <TrendChart points={trend} />
                </View>

                <SubjectsCard
                  subjects={subjects.slice(0, 4)}
                  onSubjectPress={() => openReport()}
                />

                <RecentActivitiesCard
                  activities={recent}
                  expanded={expanded}
                  onToggle={() => setExpanded((value) => !value)}
                  onActivityPress={showActivity}
                  onTrophyPress={() => changeTab("reports")}
                  firstName={firstName}
                />
              </Animated.View>
            ) : tab === "subjects" ? (
              <Animated.View
                key="subjects"
                entering={FadeInDown.duration(260)}
                style={styles.tabContent}
              >
                <SubjectsCard
                  subjects={subjects}
                  onSubjectPress={() => openReport()}
                />
              </Animated.View>
            ) : (
              <Animated.View
                key="reports"
                entering={FadeInDown.duration(260)}
                style={styles.tabContent}
              >
                <ReportsCard
                  reports={reports.data ?? []}
                  loading={reports.isLoading}
                  error={reports.error}
                  onRetry={() => void reports.refetch()}
                  onPress={openReport}
                />
              </Animated.View>
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function OverallStat({
  tone,
  count,
  label,
  icon,
}: {
  tone: "green" | "amber" | "red";
  count: number;
  label: string;
  icon: ReactNode;
}) {
  return (
    <View style={styles.overallStatRow}>
      <StatBadge tone={tone}>{icon}</StatBadge>
      <Text style={styles.overallStatCount}>{count}</Text>
      <Text style={styles.overallStatLabel}>{label}</Text>
    </View>
  );
}

function SubjectsCard({
  subjects,
  onSubjectPress,
}: {
  subjects: SubjectPerformance[];
  onSubjectPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: "#F3EAFF" }]}>
          <BookOpen size={18} color="#9B51E0" strokeWidth={2.2} />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>Subject Performance</Text>
          <Text style={styles.cardSubtitle}>Scores by subject</Text>
        </View>
      </View>
      {subjects.length ? (
        subjects.map((subject, position) => (
          <View key={subject.name}>
            {position > 0 ? <View style={styles.rowDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${subject.name} results`}
              onPress={onSubjectPress}
              style={styles.subjectRow}
            >
              <SubjectBadge name={subject.name} size={40} />
              <View style={styles.subjectMain}>
                <Text style={styles.subjectName} numberOfLines={1}>
                  {subject.name}
                </Text>
                <View style={styles.subjectTrack}>
                  <View
                    style={[
                      styles.subjectFill,
                      {
                        width: `${Math.max(
                          0,
                          Math.min(100, subject.percent),
                        )}%`,
                        backgroundColor: subjectTone(subject.percent),
                      },
                    ]}
                  />
                </View>
              </View>
              <View style={styles.subjectRight}>
                <Text style={styles.subjectPercent}>{subject.percent}%</Text>
                <ChevronRight
                  size={17}
                  color={academicColors.muted}
                  strokeWidth={2.2}
                />
              </View>
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>No subject scores recorded yet.</Text>
      )}
    </View>
  );
}

function RecentActivitiesCard({
  activities,
  expanded,
  onToggle,
  onActivityPress,
  onTrophyPress,
  firstName,
}: {
  activities: DailyActivity[];
  expanded: boolean;
  onToggle: () => void;
  onActivityPress: (activity: DailyActivity) => void;
  onTrophyPress: () => void;
  firstName: string;
}) {
  const visible = expanded ? activities : activities.slice(0, 4);
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: "#EAF2FF" }]}>
          <FileText size={18} color={academicColors.blue} strokeWidth={2.2} />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>Recent Activities</Text>
        </View>
        {activities.length > 4 ? (
          <Pressable
            accessibilityRole="button"
            onPress={onToggle}
            hitSlop={8}
            style={styles.viewAll}
          >
            <Text style={styles.viewAllText}>
              {expanded ? "Show less" : "View all"}
            </Text>
            <ChevronRight
              size={15}
              color={academicColors.blue}
              strokeWidth={2.4}
            />
          </Pressable>
        ) : null}
      </View>

      {visible.length ? (
        visible.map((activity, position) => {
          const status = activityStatus(activity);
          return (
            <View key={activity.id}>
              {position > 0 ? <View style={styles.rowDivider} /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`View ${activity.title}`}
                onPress={() => onActivityPress(activity)}
                style={styles.activityRow}
              >
                <SubjectBadge name={activity.subject_name} size={40} />
                <View style={styles.activityMain}>
                  <Text style={styles.activityTitle} numberOfLines={1}>
                    {activity.title}
                  </Text>
                  <Text style={styles.activitySubject} numberOfLines={1}>
                    {activity.subject_name}
                  </Text>
                  <Text style={styles.activityDate}>
                    {formatActivityDate(activity.due_on)}
                  </Text>
                </View>
                <View style={styles.activityRight}>
                  <View
                    style={[
                      styles.activityPill,
                      { backgroundColor: status.background },
                    ]}
                  >
                    <Text
                      style={[styles.activityPillText, { color: status.color }]}
                    >
                      {status.label}
                    </Text>
                  </View>
                  <ChevronRight
                    size={17}
                    color={academicColors.muted}
                    strokeWidth={2.2}
                  />
                </View>
              </Pressable>
            </View>
          );
        })
      ) : (
        <Text style={styles.emptyText}>No activities recorded yet.</Text>
      )}

      <Pressable
        accessibilityRole="button"
        onPress={onTrophyPress}
        style={({ pressed }) => [pressed && styles.rowPressed]}
      >
        <View style={styles.trophyBanner}>
          <Trophy size={22} color={academicColors.blue} strokeWidth={2.1} />
          <View style={styles.trophyCopy}>
            <Text style={styles.trophyTitle}>Great progress, {firstName}!</Text>
            <Text style={styles.trophyBody}>Keep up the good work!</Text>
          </View>
          <ChevronRight
            size={17}
            color={academicColors.blueDeep}
            strokeWidth={2.2}
          />
        </View>
      </Pressable>
    </View>
  );
}

function ReportsCard({
  reports,
  loading,
  error,
  onRetry,
  onPress,
}: {
  reports: ReportSummary[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onPress: (termId: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: "#EAF2FF" }]}>
          <FileText size={18} color={academicColors.blue} strokeWidth={2.2} />
        </View>
        <View style={styles.cardHeading}>
          <Text style={styles.cardTitle}>Published Reports</Text>
          <Text style={styles.cardSubtitle}>Official school results</Text>
        </View>
      </View>
      {loading ? (
        <View style={styles.reportsLoading}>
          <ActivityIndicator color={academicColors.blue} />
        </View>
      ) : error ? (
        <Pressable onPress={onRetry} style={styles.reportsEmpty}>
          <Text style={styles.emptyText}>
            Reports could not load. Tap to try again.
          </Text>
        </Pressable>
      ) : reports.length ? (
        reports.map((report, position) => (
          <View key={report.term_id}>
            {position > 0 ? <View style={styles.rowDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${report.term_name} report card`}
              onPress={() => onPress(report.term_id)}
              style={styles.reportRow}
            >
              <View style={styles.reportIcon}>
                <FileText
                  size={19}
                  color={academicColors.blue}
                  strokeWidth={2}
                />
              </View>
              <View style={styles.reportMain}>
                <Text style={styles.reportTerm} numberOfLines={1}>
                  {report.term_name}
                </Text>
                <Text style={styles.reportYear} numberOfLines={1}>
                  {report.academic_year_name} Academic Year
                </Text>
              </View>
              <View style={styles.reportScore}>
                <Text style={styles.reportScoreText}>
                  {report.grade ??
                    (report.aggregate_percent == null
                      ? "—"
                      : `${Math.round(Number(report.aggregate_percent))}%`)}
                </Text>
              </View>
              <ChevronRight
                size={17}
                color={academicColors.muted}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>
        ))
      ) : (
        <Text style={styles.emptyText}>
          No published report cards yet. They will appear here when your school
          releases them.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: academicColors.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: academicColors.page,
  },
  back: {
    width: 30,
    height: 42,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  headerInitials: { fontSize: 15, fontWeight: "800" },
  headerCopy: { flex: 1, minWidth: 0 },
  headerName: {
    color: academicColors.ink,
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  headerClass: {
    color: academicColors.muted,
    fontSize: 12.5,
    marginTop: 2,
  },
  more: {
    width: 32,
    height: 42,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  scroll: { flex: 1 },
  body: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 14,
  },
  loading: { paddingVertical: 60, alignItems: "center" },
  overallCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: academicColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: academicColors.border,
    padding: 13,
  },
  overallLeft: {
    width: 108,
    alignItems: "center",
    gap: 5,
  },
  overallLabel: {
    color: academicColors.muted,
    fontSize: 13,
    fontWeight: "600",
  },
  overallDivider: {
    width: 1,
    height: 96,
    backgroundColor: academicColors.border,
    marginHorizontal: 10,
  },
  overallStats: { flex: 1, gap: 10 },
  overallStatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  overallStatCount: {
    color: academicColors.ink,
    fontSize: 19,
    fontWeight: "800",
    minWidth: 20,
  },
  overallStatLabel: {
    color: academicColors.muted,
    fontSize: 13,
  },
  segments: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  segment: {
    flex: 1,
    height: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentIdle: {
    backgroundColor: academicColors.blueSoft,
    borderWidth: 1,
    borderColor: "#DCE8FA",
  },
  segmentActive: {
    backgroundColor: academicColors.blueBright,
    shadowColor: "#1F6BEE",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  segmentText: { fontSize: 13, fontWeight: "700" },
  segmentTextIdle: { color: academicColors.blueDeep },
  segmentTextActive: { color: "#FFFFFF" },
  tabContent: { gap: 14 },
  card: {
    backgroundColor: academicColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: academicColors.border,
    padding: 14,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeading: { flex: 1, minWidth: 0 },
  cardTitle: {
    color: academicColors.ink,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  cardSubtitle: {
    color: academicColors.muted,
    fontSize: 12.5,
    marginTop: 1,
  },
  rangeWrap: { position: "relative", zIndex: 20 },
  rangePill: {
    height: 31,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: academicColors.blueSoft,
  },
  rangeText: {
    color: academicColors.blueDeep,
    fontSize: 12,
    fontWeight: "700",
  },
  rangeMenu: {
    position: "absolute",
    top: 35,
    right: 0,
    width: 136,
    padding: 4,
    borderRadius: 12,
    backgroundColor: academicColors.card,
    borderWidth: 1,
    borderColor: academicColors.border,
    shadowColor: "#12345F",
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  rangeOption: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 8,
  },
  rangeOptionActive: { backgroundColor: academicColors.blueSoft },
  rangeOptionText: {
    color: academicColors.muted,
    fontSize: 11.5,
    fontWeight: "600",
  },
  rangeOptionTextActive: {
    color: academicColors.blueDeep,
    fontWeight: "700",
  },
  subjectRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
  },
  subjectMain: { flex: 1, minWidth: 0, gap: 7 },
  subjectName: {
    color: academicColors.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  subjectTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: academicColors.track,
    overflow: "hidden",
  },
  subjectFill: { height: 6, borderRadius: 3 },
  subjectRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  subjectPercent: {
    color: academicColors.ink,
    fontSize: 14,
    fontWeight: "800",
    minWidth: 34,
    textAlign: "right",
  },
  rowDivider: {
    height: 1,
    backgroundColor: academicColors.border,
    marginLeft: 52,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 11,
  },
  activityMain: { flex: 1, minWidth: 0, gap: 2 },
  activityTitle: {
    color: academicColors.ink,
    fontSize: 13.5,
    fontWeight: "800",
  },
  activitySubject: {
    color: academicColors.muted,
    fontSize: 12.5,
  },
  activityDate: {
    color: academicColors.mutedLight,
    fontSize: 11.5,
  },
  activityRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  activityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  activityPillText: { fontSize: 11, fontWeight: "700" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 1 },
  viewAllText: {
    color: academicColors.blue,
    fontSize: 11.5,
    fontWeight: "700",
  },
  trophyBanner: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#EAF4FF",
  },
  trophyCopy: { flex: 1, minWidth: 0 },
  trophyTitle: {
    color: academicColors.blue,
    fontSize: 13.5,
    fontWeight: "800",
  },
  trophyBody: {
    color: "#5C7BA6",
    fontSize: 11.5,
    marginTop: 2,
  },
  emptyText: {
    color: academicColors.muted,
    fontSize: 12.5,
    lineHeight: 19,
    paddingVertical: 8,
  },
  reportsLoading: { paddingVertical: 24, alignItems: "center" },
  reportsEmpty: { paddingVertical: 4 },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  reportIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: academicColors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  reportMain: { flex: 1, minWidth: 0, gap: 2 },
  reportTerm: {
    color: academicColors.ink,
    fontSize: 13.5,
    fontWeight: "800",
  },
  reportYear: { color: academicColors.muted, fontSize: 12 },
  reportScore: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: academicColors.blueSoft,
  },
  reportScoreText: {
    color: academicColors.blueDeep,
    fontSize: 11.5,
    fontWeight: "800",
  },
  rowPressed: { opacity: 0.68 },
  pressed: { opacity: 0.7 },
});
