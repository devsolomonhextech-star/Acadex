import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Info,
  PieChart,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react-native";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { apiErrorMessage } from "../../src/api/client";
import { ChildSwitcher } from "../../src/components/ChildSwitcher";
import { PageHeader } from "../../src/components/insights/PageHeader";
import {
  AnimatedBar,
  AnimatedNumberText,
  AnimatedRing,
  DonutChart,
  FloatingOrb,
  InsightSectionHeader,
  PressableScale,
} from "../../src/components/insights/InsightVisuals";
import { EmptyState, LoadingState } from "../../src/components/ui";
import { familyApi } from "../../src/features/familyApi";
import {
  ATTENDANCE_META,
  ATTENDANCE_STATUSES,
  attendanceStats,
  dateTile,
  formatLongDate,
  insightColors,
  sortedRecords,
  type AttendanceStats,
  type AttendanceStatus,
  type WeekAttendance,
  weeklyAttendance,
} from "../../src/features/insights";
import { useChildren } from "../../src/services/parentData";
import type { AttendanceRecord, Child } from "../../src/types/models";

const STATUS_ICONS: Record<AttendanceStatus, LucideIcon> = {
  present: Check,
  late: Clock3,
  absent: X,
  excused: ShieldCheck,
};

export default function AttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    selectedChild,
    isLoading: childrenLoading,
    error: childrenError,
  } = useChildren();
  const query = useQuery({
    queryKey: ["attendance", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.attendance(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });

  const stats = useMemo(() => attendanceStats(query.data), [query.data]);
  const weeks = useMemo(
    () => weeklyAttendance(query.data?.records ?? []).slice(-6),
    [query.data],
  );
  const recent = useMemo(
    () => sortedRecords(query.data?.records ?? []),
    [query.data],
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/(tabs)/home");
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Attendance"
        subtitle={
          selectedChild
            ? `${selectedChild.first_name}’s recorded school days`
            : "Daily records from your school"
        }
        onBack={goBack}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 26 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
            tintColor={insightColors.blue}
          />
        }
      >
        <ChildSwitcher />

        {childrenLoading ? null : !selectedChild ? (
          childrenError ? null : (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <CalendarDays
                  size={27}
                  color={insightColors.blue}
                  strokeWidth={1.9}
                />
              </View>
              <Text style={styles.emptyTitle}>No child selected</Text>
              <Text style={styles.emptyBody}>
                Link a child to this parent account to see their attendance.
              </Text>
            </View>
          )
        ) : query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <EmptyState
            title="Attendance could not load"
            body={apiErrorMessage(query.error)}
            retry={() => void query.refetch()}
          />
        ) : !query.data?.records.length ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <CalendarDays
                size={27}
                color={insightColors.blue}
                strokeWidth={1.9}
              />
            </View>
            <Text style={styles.emptyTitle}>No attendance recorded yet</Text>
            <Text style={styles.emptyBody}>
              Daily records saved by your school will appear here.
            </Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(420)}>
              <AttendanceHero child={selectedChild} stats={stats} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(90).duration(400)}>
              <AttendanceBreakdown stats={stats} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <WeeklyRhythm weeks={weeks} />
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(220).duration(400)}>
              <RecentRecords records={recent} />
            </Animated.View>

            <Animated.View entering={FadeInUp.delay(280).duration(400)}>
              <View style={styles.infoCard}>
                <View style={styles.infoIcon}>
                  <ShieldCheck
                    size={18}
                    color={insightColors.blue}
                    strokeWidth={2}
                  />
                </View>
                <Text style={styles.infoText}>
                  Attendance comes from entries saved by your school. The rate
                  counts present and late days; excused days are shown
                  separately.
                </Text>
              </View>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AttendanceHero({
  child,
  stats,
}: {
  child: Child;
  stats: AttendanceStats;
}) {
  return (
    <View style={styles.hero}>
      <LinearGradient
        colors={[
          insightColors.heroStart,
          insightColors.heroMid,
          insightColors.heroEnd,
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <FloatingOrb style={styles.heroOrbLarge} distance={12} duration={5600} />
      <FloatingOrb style={styles.heroOrbSmall} distance={-9} duration={4800} />
      <View style={styles.heroTopRow}>
        <View style={styles.heroPill}>
          <CalendarDays size={12} color="#FFFFFF" strokeWidth={2.2} />
          <Text style={styles.heroPillText}>RECORDED ATTENDANCE</Text>
        </View>
      </View>
      <View style={styles.heroMain}>
        <AnimatedRing
          size={112}
          strokeWidth={9}
          percent={stats.rate}
          color={insightColors.mint}
          trackColor="rgba(255,255,255,0.3)"
        >
          <AnimatedNumberText
            value={stats.rate}
            style={styles.heroRate}
            suffix="%"
          />
          <Text style={styles.heroRateLabel}>ATTENDANCE</Text>
        </AnimatedRing>
        <View style={styles.heroCopy}>
          <Text style={styles.heroName} numberOfLines={1}>
            {child.first_name} {child.last_name}
          </Text>
          <Text style={styles.heroClass} numberOfLines={1}>
            {child.class_name || "Class not assigned"}
          </Text>
          <Text style={styles.heroCaption}>
            {stats.presentOrLate} of {stats.total} recorded days
          </Text>
          <View style={styles.heroTag}>
            <CheckCircle2
              size={13}
              color={insightColors.mintDeep}
              strokeWidth={2.4}
            />
            <Text style={styles.heroTagText}>Present or late</Text>
          </View>
        </View>
      </View>
      <View style={styles.heroStats}>
        <HeroStat
          label="Present"
          value={stats.counts.present}
          divider={false}
        />
        <HeroStat label="Late" value={stats.counts.late} />
        <HeroStat label="Absent" value={stats.counts.absent} />
        <HeroStat label="Excused" value={stats.counts.excused} />
      </View>
    </View>
  );
}

function HeroStat({
  label,
  value,
  divider = true,
}: {
  label: string;
  value: number;
  divider?: boolean;
}) {
  return (
    <>
      {divider ? <View style={styles.heroStatDivider} /> : null}
      <View style={styles.heroStat}>
        <AnimatedNumberText value={value} style={styles.heroStatValue} />
        <Text style={styles.heroStatLabel}>{label}</Text>
      </View>
    </>
  );
}

function AttendanceBreakdown({ stats }: { stats: AttendanceStats }) {
  const segments = ATTENDANCE_STATUSES.map((status) => ({
    value: stats.counts[status],
    color: ATTENDANCE_META[status].color,
  }));
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={PieChart}
        title="Recorded days"
        subtitle={`${stats.total} ${stats.total === 1 ? "entry" : "entries"} from your school`}
        tint="#F3EAFF"
        color="#9B51E0"
      />
      <View style={styles.breakdownBody}>
        <DonutChart segments={segments} size={128} strokeWidth={15}>
          <AnimatedNumberText value={stats.total} style={styles.donutValue} />
          <Text style={styles.donutLabel}>DAYS</Text>
        </DonutChart>
        <View style={styles.legend}>
          {ATTENDANCE_STATUSES.map((status) => {
            const meta = ATTENDANCE_META[status];
            const count = stats.counts[status];
            const percent = stats.total
              ? Math.round((count / stats.total) * 100)
              : 0;
            return (
              <View key={status} style={styles.legendRow}>
                <View
                  style={[styles.legendDot, { backgroundColor: meta.color }]}
                />
                <Text style={styles.legendLabel}>{meta.label}</Text>
                <Text style={styles.legendCount}>{count}</Text>
                <Text style={styles.legendPercent}>{percent}%</Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.breakdownNote}>
        <Info size={12} color={insightColors.blue} strokeWidth={2.2} />
        <Text style={styles.breakdownNoteText}>
          Excused days are shown separately and aren’t counted as absences.
        </Text>
      </View>
    </View>
  );
}

function WeeklyRhythm({ weeks }: { weeks: WeekAttendance[] }) {
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={BarChart3}
        title="Weekly rhythm"
        subtitle="Attendance rate by recorded week"
        tint={insightColors.blueSoft}
        color={insightColors.blue}
      />
      {weeks.length ? (
        <View style={styles.weekChart}>
          {weeks.map((week, index) => {
            const color =
              week.rate >= 90
                ? insightColors.green
                : week.rate >= 75
                  ? insightColors.amber
                  : insightColors.red;
            return (
              <View key={week.start.toISOString()} style={styles.weekColumn}>
                <Text style={[styles.weekValue, { color }]}>{week.rate}%</Text>
                <AnimatedBar
                  value={week.rate}
                  height={104}
                  color={color}
                  delay={200 + index * 70}
                />
                <Text style={styles.weekLabel}>{week.label}</Text>
                <Text style={styles.weekYear}>
                  ’{String(week.year).slice(-2)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.weekEmpty}>Weekly data will appear here.</Text>
      )}
      <View style={styles.chartFootnote}>
        <View style={styles.footDot} />
        <Text style={styles.chartFootnoteText}>
          Weeks without a recorded school day are omitted.
        </Text>
      </View>
    </View>
  );
}

function RecentRecords({ records }: { records: AttendanceRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? records : records.slice(0, 6);
  return (
    <View style={styles.card}>
      <InsightSectionHeader
        icon={ClipboardList}
        title="Recent records"
        subtitle={`${records.length} recorded ${records.length === 1 ? "day" : "days"}`}
        tint={insightColors.greenSoft}
        color={insightColors.greenDark}
        right={
          records.length > 6 ? (
            <PressableScale
              accessibilityLabel={
                expanded ? "Show fewer records" : "Show all records"
              }
              onPress={() => setExpanded((value) => !value)}
              style={styles.viewAll}
            >
              <Text style={styles.viewAllText}>
                {expanded ? "Show less" : "View all"}
              </Text>
              {expanded ? (
                <ChevronUp
                  size={14}
                  color={insightColors.blue}
                  strokeWidth={2.4}
                />
              ) : (
                <ChevronDown
                  size={14}
                  color={insightColors.blue}
                  strokeWidth={2.4}
                />
              )}
            </PressableScale>
          ) : null
        }
      />
      <View style={styles.records}>
        {visible.map((record, index) => (
          <Animated.View
            key={`${record.date}-${record.status}-${index}`}
            entering={FadeInUp.delay(Math.min(index, 6) * 30).duration(260)}
          >
            {index > 0 ? <View style={styles.recordDivider} /> : null}
            <RecordRow record={record} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function RecordRow({ record }: { record: AttendanceRecord }) {
  const meta = ATTENDANCE_META[record.status];
  const tile = dateTile(record.date);
  const Icon = STATUS_ICONS[record.status];
  return (
    <View style={styles.recordRow}>
      <View style={[styles.dateTile, { backgroundColor: meta.soft }]}>
        <Text style={[styles.dateDay, { color: meta.deep }]}>{tile.day}</Text>
        <Text style={[styles.dateMonth, { color: meta.color }]}>
          {tile.month}
        </Text>
      </View>
      <View style={styles.recordCopy}>
        <Text style={styles.recordWeekday} numberOfLines={1}>
          {formatLongDate(record.date)}
        </Text>
        <Text style={styles.recordNote} numberOfLines={1}>
          {record.note || "Saved by your school"}
        </Text>
      </View>
      <View style={[styles.statusPill, { backgroundColor: meta.soft }]}>
        <Icon size={11} color={meta.deep} strokeWidth={2.6} />
        <Text style={[styles.statusLabel, { color: meta.deep }]}>
          {meta.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: insightColors.page },
  content: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 32,
    gap: 14,
  },
  hero: {
    borderRadius: 24,
    padding: 17,
    overflow: "hidden",
    shadowColor: "#0A3FA8",
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
    top: -70,
    right: -50,
    backgroundColor: "rgba(255,255,255,0.11)",
  },
  heroOrbSmall: {
    position: "absolute",
    width: 108,
    height: 108,
    borderRadius: 54,
    bottom: -38,
    left: -26,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroTopRow: { flexDirection: "row", alignItems: "center" },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroPillText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "800",
    letterSpacing: 1.05,
  },
  heroMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 14,
  },
  heroRate: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  heroRateLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginTop: 2,
  },
  heroCopy: { flex: 1, minWidth: 0, gap: 2 },
  heroName: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  heroClass: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11.5,
  },
  heroCaption: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    marginTop: 7,
  },
  heroTag: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(127,240,196,0.14)",
  },
  heroTagText: {
    color: insightColors.mintDeep,
    fontSize: 9.5,
    fontWeight: "700",
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 15,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  heroStat: { flex: 1, alignItems: "center", gap: 1 },
  heroStatValue: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  heroStatLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 8.5,
    fontWeight: "600",
  },
  heroStatDivider: {
    width: 1,
    height: 23,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  card: {
    backgroundColor: insightColors.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: insightColors.border,
    padding: 15,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 1,
  },
  breakdownBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 3,
  },
  donutValue: {
    color: insightColors.ink,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  donutLabel: {
    color: insightColors.muted,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginTop: 1,
  },
  legend: { flex: 1, minWidth: 0, gap: 9 },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: {
    flex: 1,
    color: insightColors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  legendCount: {
    color: insightColors.ink,
    fontSize: 12,
    fontWeight: "800",
    minWidth: 20,
    textAlign: "right",
  },
  legendPercent: {
    color: insightColors.muted,
    fontSize: 10.5,
    minWidth: 34,
    textAlign: "right",
  },
  breakdownNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F4FA",
  },
  breakdownNoteText: {
    flex: 1,
    color: insightColors.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  weekChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 7,
    paddingTop: 3,
  },
  weekColumn: { flex: 1, alignItems: "center", gap: 5 },
  weekValue: { fontSize: 10.5, fontWeight: "800" },
  weekLabel: {
    color: insightColors.muted,
    fontSize: 8.5,
    fontWeight: "600",
    marginTop: 1,
  },
  weekYear: {
    color: insightColors.mutedLight,
    fontSize: 7.5,
    fontWeight: "600",
    marginTop: -3,
  },
  weekEmpty: {
    color: insightColors.muted,
    fontSize: 12,
    paddingVertical: 24,
    textAlign: "center",
  },
  chartFootnote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  footDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: insightColors.blue,
  },
  chartFootnoteText: {
    color: insightColors.mutedLight,
    fontSize: 9,
  },
  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingLeft: 6,
  },
  viewAllText: {
    color: insightColors.blue,
    fontSize: 10.5,
    fontWeight: "700",
  },
  records: { marginTop: 1 },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  recordDivider: {
    height: 1,
    backgroundColor: "#F0F4FA",
    marginLeft: 54,
  },
  dateTile: {
    width: 44,
    height: 49,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  dateDay: { fontSize: 16.5, fontWeight: "800" },
  dateMonth: { fontSize: 8, fontWeight: "800", letterSpacing: 0.5 },
  recordCopy: { flex: 1, minWidth: 0, gap: 2 },
  recordWeekday: {
    color: insightColors.ink,
    fontSize: 11.5,
    fontWeight: "700",
  },
  recordNote: {
    color: insightColors.muted,
    fontSize: 9.5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusLabel: { fontSize: 9.5, fontWeight: "700" },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderRadius: 16,
    backgroundColor: insightColors.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E9FC",
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    flex: 1,
    color: insightColors.blueDeep,
    fontSize: 10,
    lineHeight: 15.5,
    fontWeight: "500",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: insightColors.card,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: insightColors.border,
    paddingVertical: 36,
    paddingHorizontal: 22,
    gap: 8,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: insightColors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  emptyTitle: {
    color: insightColors.ink,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyBody: {
    color: insightColors.muted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
});
