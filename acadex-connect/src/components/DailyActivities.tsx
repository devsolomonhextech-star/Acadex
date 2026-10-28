import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  PenLine,
  Puzzle,
  Star,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { colors, radius, space } from "../theme/tokens";
import type { DailyActivity } from "../types/models";
import { EmptyState, LoadingState } from "./ui";

type CategoryMeta = {
  label: string;
  icon: LucideIcon;
  color: string;
  tint: string;
};

const CATEGORY: Record<string, CategoryMeta> = {
  quiz: { label: "Quiz", icon: Zap, color: "#8755D6", tint: "#F3ECFF" },
  class_test: {
    label: "Test",
    icon: ClipboardList,
    color: "#2873E8",
    tint: "#EAF3FF",
  },
  assignment: {
    label: "Exercise",
    icon: PenLine,
    color: "#189B69",
    tint: "#E9F8EF",
  },
  examination: {
    label: "Exam",
    icon: FileText,
    color: "#D47A22",
    tint: "#FDF0E2",
  },
  project: {
    label: "Project",
    icon: Puzzle,
    color: "#22A9E8",
    tint: "#E8F7FD",
  },
  practical: {
    label: "Practical",
    icon: Target,
    color: "#189B69",
    tint: "#E9F8EF",
  },
  other: { label: "Activity", icon: Star, color: "#65738A", tint: "#EEF2F7" },
};
const FALLBACK: CategoryMeta = CATEGORY.other;

const GROUPS: { state: DailyActivity["state"]; label: string }[] = [
  { state: "overdue", label: "Overdue" },
  { state: "due_today", label: "Due today" },
  { state: "due_soon", label: "This week" },
  { state: "upcoming", label: "Upcoming" },
  { state: "completed", label: "Completed" },
];

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "class_test", label: "Tests" },
  { key: "quiz", label: "Quizzes" },
  { key: "assignment", label: "Exercises" },
  { key: "examination", label: "Exams" },
];

const COLLAPSED_COUNT = 6;

function number(value: string | number | null): string {
  if (value == null) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function dueLabel(dueOn: string | null): string {
  if (!dueOn) return "No date set";
  const date = new Date(`${dueOn}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DailyActivities({
  activities,
  isLoading,
  error,
  onRetry,
}: {
  activities?: DailyActivity[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);

  const presentCategories = useMemo(() => {
    const set = new Set((activities ?? []).map((item) => item.category));
    return FILTERS.filter((chip) => chip.key === "all" || set.has(chip.key));
  }, [activities]);

  const filtered = useMemo(
    () =>
      (activities ?? []).filter(
        (item) => filter === "all" || item.category === filter,
      ),
    [activities, filter],
  );

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        items: filtered
          .filter((item) => item.state === group.state)
          .sort((a, b) =>
            group.state === "completed"
              ? String(b.due_on ?? "").localeCompare(String(a.due_on ?? ""))
              : String(a.due_on ?? "9999").localeCompare(
                  String(b.due_on ?? "9999"),
                ),
          ),
      })).filter((group) => group.items.length),
    [filtered],
  );

  const dueToday = filtered.filter((item) => item.state === "due_today").length;
  const overdue = filtered.filter((item) => item.state === "overdue").length;
  const completed = filtered.filter(
    (item) => item.state === "completed",
  ).length;

  const totalCount = grouped.reduce(
    (sum, group) => sum + group.items.length,
    0,
  );
  const visibleCount = expanded
    ? totalCount
    : Math.min(COLLAPSED_COUNT, totalCount);

  // Display order (group order, then the group's own sort) drives both the
  // collapse window and the staggered entrance delays.
  const flatOrder = useMemo(
    () => grouped.flatMap((group) => group.items),
    [grouped],
  );
  const visibleIds = useMemo(
    () => new Set(flatOrder.slice(0, visibleCount).map((item) => item.id)),
    [flatOrder, visibleCount],
  );
  const entranceIndex = useMemo(
    () => new Map(flatOrder.map((item, index) => [item.id, index])),
    [flatOrder],
  );

  if (isLoading) return <LoadingState />;
  if (error)
    return (
      <EmptyState
        title="Activities could not load"
        body="Daily activities are unavailable right now."
        retry={onRetry}
      />
    );
  if (!activities?.length)
    return (
      <EmptyState
        title="No daily activities yet"
        body="Tests, exercises and quizzes posted by your child's teachers will appear here."
      />
    );

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <View
          style={[styles.summaryItem, { backgroundColor: colors.warningSoft }]}
        >
          <Text style={[styles.summaryValue, { color: colors.warning }]}>
            {dueToday}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.warning }]}>
            Due today
          </Text>
        </View>
        <View
          style={[styles.summaryItem, { backgroundColor: colors.dangerSoft }]}
        >
          <Text style={[styles.summaryValue, { color: colors.danger }]}>
            {overdue}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.danger }]}>
            Overdue
          </Text>
        </View>
        <View
          style={[styles.summaryItem, { backgroundColor: colors.successSoft }]}
        >
          <Text style={[styles.summaryValue, { color: colors.success }]}>
            {completed}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.success }]}>
            Completed
          </Text>
        </View>
      </View>

      <ActivityChips
        chips={presentCategories}
        active={filter}
        onSelect={(key) => {
          setFilter(key);
          setExpanded(false);
        }}
      />

      {grouped.length ? (
        <View style={styles.groups}>
          {grouped.map((group) => {
            const shown = group.items.filter((item) => visibleIds.has(item.id));
            if (!shown.length) return null;
            return (
              <View key={group.state} style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text
                    style={[
                      styles.groupLabel,
                      group.state === "overdue" && { color: colors.danger },
                      group.state === "due_today" && { color: colors.warning },
                      group.state === "completed" && { color: colors.success },
                    ]}
                  >
                    {group.label}
                  </Text>
                  <View style={styles.groupCount}>
                    <Text style={styles.groupCountText}>
                      {group.items.length}
                    </Text>
                  </View>
                </View>
                {shown.map((activity) => {
                  const meta = CATEGORY[activity.category] ?? FALLBACK;
                  const Icon = meta.icon;
                  return (
                    <Animated.View
                      key={activity.id}
                      entering={FadeInUp.delay(
                        (entranceIndex.get(activity.id) ?? 0) * 55,
                      ).duration(280)}
                    >
                      <ActivityRow
                        activity={activity}
                        meta={meta}
                        Icon={Icon}
                      />
                    </Animated.View>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyState
          title="Nothing here"
          body="There are no activities matching this filter."
        />
      )}

      {totalCount > COLLAPSED_COUNT ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((value) => !value)}
          style={({ pressed }) => [
            styles.moreButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.moreText}>
            {expanded
              ? "Show fewer activities"
              : `Show all ${totalCount} activities`}
          </Text>
          <ChevronRight
            size={15}
            color={colors.blue}
            strokeWidth={2.5}
            style={expanded ? styles.chevronUp : undefined}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function ActivityRow({
  activity,
  meta,
  Icon,
}: {
  activity: DailyActivity;
  meta: CategoryMeta;
  Icon: LucideIcon;
}) {
  const scored = activity.score != null;
  const percent = activity.score_percent;
  const tone =
    percent == null
      ? null
      : percent >= 70
        ? colors.success
        : percent >= 50
          ? colors.warning
          : colors.danger;
  const toneSoft =
    tone === colors.success
      ? colors.successSoft
      : tone === colors.warning
        ? colors.warningSoft
        : colors.dangerSoft;

  let pillText = "";
  let pillColor: string = colors.muted;
  let pillBg = "#EEF2F7";
  if (scored && tone) {
    pillText = `${number(activity.score)}/${number(activity.max_score)}`;
    pillColor = tone;
    pillBg = toneSoft;
  } else if (activity.state === "overdue") {
    pillText = "Overdue";
    pillColor = colors.danger;
    pillBg = colors.dangerSoft;
  } else if (activity.state === "due_today") {
    pillText = "Due today";
    pillColor = colors.warning;
    pillBg = colors.warningSoft;
  } else if (activity.due_on) {
    pillText = dueLabel(activity.due_on);
    pillColor = colors.blue;
    pillBg = colors.blueSoft;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${meta.label} ${activity.title}, ${activity.subject_name}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, { backgroundColor: meta.tint }]}>
        <Icon size={19} color={meta.color} strokeWidth={2.1} />
      </View>
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {activity.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {meta.label} · {activity.subject_name}
        </Text>
        <View style={styles.dueRow}>
          <CalendarDays size={11} color={colors.mutedLight} strokeWidth={2} />
          <Text style={styles.dueText}>
            {scored
              ? `Marked · ${dueLabel(activity.due_on)}`
              : dueLabel(activity.due_on)}
          </Text>
        </View>
      </View>
      <View style={styles.rowRight}>
        {pillText ? (
          <View style={[styles.pill, { backgroundColor: pillBg }]}>
            <Text style={[styles.pillText, { color: pillColor }]}>
              {pillText}
            </Text>
          </View>
        ) : null}
        {scored && percent != null ? (
          <Text style={[styles.percent, { color: tone ?? colors.muted }]}>
            {Math.round(percent)}%
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ActivityChips({
  chips,
  active,
  onSelect,
}: {
  chips: { key: string; label: string }[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      {chips.map((chip) => {
        const selected = chip.key === active;
        return (
          <Pressable
            key={chip.key}
            accessibilityRole="button"
            accessibilityLabel={`Filter ${chip.label}`}
            onPress={() => onSelect(chip.key)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  summary: { flexDirection: "row", gap: 8 },
  summaryItem: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
    gap: 1,
  },
  summaryValue: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  summaryLabel: { fontSize: 10, fontWeight: "700", opacity: 0.85 },
  chips: { gap: 8, paddingRight: space.lg },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontSize: 12, fontWeight: "700", color: colors.muted },
  chipTextActive: { color: "#fff" },
  groups: { gap: space.lg },
  group: { gap: 8 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 2,
  },
  groupLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.ink,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  groupCount: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
  },
  groupCountText: { fontSize: 10, fontWeight: "800", color: colors.blueDeep },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  rowMeta: { fontSize: 12, fontWeight: "600", color: colors.muted },
  dueRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  dueText: { fontSize: 11, fontWeight: "600", color: colors.mutedLight },
  rowRight: { alignItems: "flex-end", gap: 3 },
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 11, fontWeight: "800" },
  percent: { fontSize: 11, fontWeight: "800" },
  moreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.blueSoft,
  },
  moreText: { fontSize: 13, fontWeight: "700", color: colors.blue },
  chevronUp: { transform: [{ rotate: "-90deg" }] },
});
