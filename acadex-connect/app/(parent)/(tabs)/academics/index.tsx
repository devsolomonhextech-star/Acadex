import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  GraduationCap,
  Lightbulb,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EmptyState } from "../../../../src/components/ui";
import { ProgressRing } from "../../../../src/components/academics/AcademicVisuals";
import {
  academicColors,
  aggregateProgress,
  avatarTone,
  initialsFor,
  progressTone,
  progressTrack,
  summariseActivities,
  type ChildAcademic,
} from "../../../../src/features/academics";
import { familyApi } from "../../../../src/features/familyApi";
import { useChildren } from "../../../../src/services/parentData";

type StatTone = "green" | "amber" | "red";

const STAT_TONES: Record<StatTone, { color: string; tint: string }> = {
  green: { color: academicColors.greenDark, tint: "#D9F4E5" },
  amber: { color: academicColors.amberText, tint: "#FBEBC8" },
  red: { color: academicColors.redText, tint: "#F9D8DB" },
};

export default function AcademicsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [childrenY, setChildrenY] = useState(0);
  const {
    children,
    isLoading: childrenLoading,
    error: childrenError,
    refetch: refetchChildren,
  } = useChildren();

  const activityQueries = useQueries({
    queries: children.map((child) => ({
      queryKey: ["activities", child.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        familyApi.activities(child.id, signal),
      staleTime: 30_000,
    })),
  });

  const rows = useMemo(
    () =>
      children.map((child, index) =>
        summariseActivities(child, activityQueries[index]?.data ?? []),
      ),
    [activityQueries, children],
  );
  const totals = useMemo(() => aggregateProgress(rows), [rows]);
  const refreshing = activityQueries.some((query) => query.isRefetching);
  const activitiesLoading = activityQueries.some((query) => query.isLoading);

  const refresh = () => {
    void Promise.all(activityQueries.map((query) => query.refetch()));
    refetchChildren();
  };

  const scrollToChildren = () => {
    scrollRef.current?.scrollTo({
      y: Math.max(childrenY - 8, 0),
      animated: true,
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={academicColors.blue}
          />
        }
      >
        <Text style={styles.subtitle}>
          Here’s your children’s academic progress at a glance.
        </Text>

        <Animated.View entering={FadeInUp.duration(320)}>
          <AcademicPerformanceCard
            completed={totals.completed}
            dueToday={totals.dueToday}
            overdue={totals.overdue}
            onPress={scrollToChildren}
          />
        </Animated.View>

        <View
          style={styles.childrenSection}
          onLayout={(event: LayoutChangeEvent) =>
            setChildrenY(event.nativeEvent.layout.y)
          }
        >
          <Text style={styles.sectionTitle}>Children Performance</Text>
          <Text style={styles.sectionSubtitle}>
            Quick view of each child’s overall academic progress
          </Text>

          {childrenError ? (
            <EmptyState
              title="Children could not load"
              body={childrenError.message}
              retry={refetchChildren}
            />
          ) : childrenLoading || activitiesLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={academicColors.blue} />
            </View>
          ) : !children.length ? (
            <EmptyState
              title="No linked children yet"
              body="Your school has not linked a child to this account. Contact the school office to request a verified link."
            />
          ) : (
            <View style={styles.childList}>
              {rows.map((row, index) => (
                <Animated.View
                  key={row.child.id}
                  entering={FadeInUp.delay(60 + index * 45).duration(300)}
                >
                  <ChildPerformanceCard
                    row={row}
                    index={index}
                    onPress={() =>
                      router.push({
                        pathname: "/(parent)/(tabs)/academics/[studentId]",
                        params: { studentId: row.child.id },
                      })
                    }
                  />
                </Animated.View>
              ))}
            </View>
          )}
        </View>

        <Animated.View entering={FadeInUp.delay(260).duration(300)}>
          <View style={styles.hintCard}>
            <Lightbulb size={19} color={academicColors.blue} strokeWidth={2} />
            <Text style={styles.hintText}>
              Tap on a child to see detailed breakdown and subject performance.
            </Text>
            <ChevronRight
              size={17}
              color={academicColors.blueDeep}
              strokeWidth={2.4}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function AcademicPerformanceCard({
  completed,
  dueToday,
  overdue,
  onPress,
}: {
  completed: number;
  dueToday: number;
  overdue: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Jump to children performance"
      onPress={onPress}
    >
      <View style={styles.performanceCard}>
        <LinearGradient
          colors={["#DCEBFF", "#EEF7FF", "#E8F3FF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.performanceRow}>
          <LinearGradient
            colors={["#3C8CFF", "#1F6BEE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.performanceIcon}
          >
            <GraduationCap color="#FFFFFF" size={25} strokeWidth={2} />
          </LinearGradient>
          <View style={styles.performanceCopy}>
            <Text style={styles.performanceTitle}>Academic Performance</Text>
            <Text style={styles.performanceSubtitle}>
              Across all your children
            </Text>
          </View>
          <ChevronRight
            size={20}
            color={academicColors.blueDeep}
            strokeWidth={2.4}
          />
        </View>

        <View style={styles.tiles}>
          <PerformanceTile
            tone="green"
            value={completed}
            label="Completed"
            icon={
              <CheckCircle2
                size={18}
                color={academicColors.green}
                strokeWidth={2.2}
              />
            }
          />
          <PerformanceTile
            tone="amber"
            value={dueToday}
            label="Due Today"
            icon={
              <Clock3
                size={18}
                color={academicColors.amber}
                strokeWidth={2.2}
              />
            }
          />
          <PerformanceTile
            tone="red"
            value={overdue}
            label="Overdue"
            icon={
              <CircleAlert
                size={18}
                color={academicColors.red}
                strokeWidth={2.2}
              />
            }
          />
        </View>
      </View>
    </Pressable>
  );
}

function PerformanceTile({
  tone,
  value,
  label,
  icon,
}: {
  tone: StatTone;
  value: number;
  label: string;
  icon: ReactNode;
}) {
  const palette = STAT_TONES[tone];
  return (
    <View style={styles.tile}>
      <View style={[styles.tileNumber, { backgroundColor: palette.tint }]}>
        <Text style={[styles.tileNumberText, { color: palette.color }]}>
          {value}
        </Text>
      </View>
      <Text style={[styles.tileLabel, { color: palette.color }]}>{label}</Text>
      <View style={styles.tileIcon}>{icon}</View>
    </View>
  );
}

function ChildPerformanceCard({
  row,
  index,
  onPress,
}: {
  row: ChildAcademic;
  index: number;
  onPress: () => void;
}) {
  const tone = avatarTone(index);
  const color = progressTone(row.percent);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${row.child.first_name} ${row.child.last_name} performance`}
      onPress={onPress}
    >
      <View style={styles.childCard}>
        <View style={styles.childTop}>
          <View
            style={[styles.childAvatar, { backgroundColor: tone.background }]}
          >
            <Text style={[styles.childInitials, { color: tone.foreground }]}>
              {initialsFor(row.child)}
            </Text>
          </View>
          <View style={styles.childInfo}>
            <Text style={styles.childName} numberOfLines={1}>
              {row.child.first_name} {row.child.last_name}
            </Text>
            <Text style={styles.childClass} numberOfLines={1}>
              {row.child.class_name || "Class not assigned"}
            </Text>
            <View
              style={[
                styles.statusPill,
                row.onTrack ? styles.statusOnTrack : styles.statusAttention,
              ]}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: row.onTrack
                      ? academicColors.green
                      : academicColors.amber,
                  },
                ]}
              >
                {row.onTrack ? (
                  <Check size={9} color="#FFFFFF" strokeWidth={3.4} />
                ) : (
                  <Text style={styles.statusDotText}>!</Text>
                )}
              </View>
              <Text
                style={[
                  styles.statusText,
                  {
                    color: row.onTrack
                      ? academicColors.greenDark
                      : academicColors.amberText,
                  },
                ]}
              >
                {row.onTrack ? "On Track" : "Needs Attention"}
              </Text>
            </View>
          </View>
          <View style={styles.childRight}>
            <ProgressRing
              size={58}
              strokeWidth={6.4}
              progress={row.percent}
              color={color}
              trackColor={progressTrack(row.percent)}
              label={`${row.percent}%`}
              labelSize={13.5}
            />
            <ChevronRight
              size={18}
              color={academicColors.muted}
              strokeWidth={2.2}
            />
          </View>
        </View>
        <View style={styles.childFooter}>
          <FileText size={15} color="#64748B" strokeWidth={2} />
          <Text style={styles.childFooterCount}>
            {row.completed} / {row.total}
          </Text>
          <Text style={styles.childFooterLabel}>activities completed</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: academicColors.page },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  subtitle: {
    color: academicColors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 15,
    letterSpacing: -0.1,
  },
  performanceCard: {
    borderRadius: 22,
    padding: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D9E9FC",
  },
  performanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 1,
  },
  performanceIcon: {
    width: 49,
    height: 49,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  performanceCopy: { flex: 1, minWidth: 0 },
  performanceTitle: {
    color: academicColors.ink,
    fontSize: 17.5,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  performanceSubtitle: {
    color: "#5E7CA8",
    fontSize: 12.5,
    marginTop: 2,
  },
  tiles: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  tile: {
    flex: 1,
    borderRadius: 15,
    paddingVertical: 11,
    paddingHorizontal: 4,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EFF5FC",
    shadowColor: "#1E5FA8",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  tileNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  tileNumberText: { fontSize: 18, fontWeight: "800" },
  tileLabel: { fontSize: 12, fontWeight: "700", marginTop: 7 },
  tileIcon: { marginTop: 5 },
  childrenSection: { marginTop: 22 },
  sectionTitle: {
    color: academicColors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  sectionSubtitle: {
    color: academicColors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  childList: { gap: 14, marginTop: 14 },
  loadingBox: { paddingVertical: 36, alignItems: "center" },
  childCard: {
    backgroundColor: academicColors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: academicColors.border,
    padding: 15,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  childTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  childAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  childInitials: { fontSize: 15, fontWeight: "800" },
  childInfo: { flex: 1, minWidth: 0, paddingTop: 1 },
  childName: {
    color: academicColors.ink,
    fontSize: 16.5,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  childClass: {
    color: academicColors.muted,
    fontSize: 12.5,
    marginTop: 3,
  },
  statusPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 7,
  },
  statusOnTrack: { backgroundColor: academicColors.greenSoft },
  statusAttention: { backgroundColor: academicColors.amberSoft },
  statusText: { fontSize: 11.5, fontWeight: "700" },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  statusDotText: {
    color: "#FFFFFF",
    fontSize: 9,
    lineHeight: 10,
    fontWeight: "800",
  },
  childRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 2,
  },
  childFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 14,
  },
  childFooterCount: {
    color: "#41537A",
    fontSize: 13,
    fontWeight: "800",
  },
  childFooterLabel: {
    color: academicColors.muted,
    fontSize: 12.5,
  },
  hintCard: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    backgroundColor: academicColors.blueTint,
    borderWidth: 1,
    borderColor: "#D8E9FC",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  hintText: {
    flex: 1,
    color: "#2A4E86",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.995 }] },
});
