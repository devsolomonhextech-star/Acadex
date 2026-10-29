import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, MapPin, UserRound } from "lucide-react-native";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { apiErrorMessage } from "../../src/api/client";
import { ChildPicker } from "../../src/components/ChildPicker";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../src/components/ui";
import { familyApi } from "../../src/features/familyApi";
import { useChildren } from "../../src/services/parentData";
import { colors } from "../../src/theme/tokens";

const DAYS = [
  { index: 0, short: "Mon", full: "Monday" },
  { index: 1, short: "Tue", full: "Tuesday" },
  { index: 2, short: "Wed", full: "Wednesday" },
  { index: 3, short: "Thu", full: "Thursday" },
  { index: 4, short: "Fri", full: "Friday" },
  { index: 5, short: "Sat", full: "Saturday" },
  { index: 6, short: "Sun", full: "Sunday" },
];

/** Monday-first index for today, matching the API's day_of_week. */
const TODAY = (new Date().getDay() + 6) % 7;

const ACCENTS = ["#3B54C9", "#2F8A6A", "#B9762E", "#7A4FC0", "#C4453D"];

export default function TimetableScreen() {
  const { selectedChild } = useChildren();
  const [chosenDay, setChosenDay] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ["timetable", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.timetable(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });

  const byDay = useMemo(
    () =>
      DAYS.map((day) => ({
        ...day,
        lessons: (query.data ?? [])
          .filter((lesson) => lesson.day_of_week === day.index)
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      })),
    [query.data],
  );

  const daysWithLessons = byDay.filter((day) => day.lessons.length > 0);
  const activeDay =
    chosenDay ?? (byDay[TODAY].lessons.length ? TODAY : daysWithLessons[0]?.index ?? TODAY);
  const active = byDay[activeDay];
  const visibleDays = byDay.filter(
    (day) => day.lessons.length > 0 || day.index === activeDay,
  );
  const weeklyTotal = daysWithLessons.reduce((total, day) => total + day.lessons.length, 0);

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.blue}
        />
      }
    >
      <Heading
        title="Timetable"
        subtitle={
          selectedChild
            ? `Weekly lessons for ${selectedChild.first_name}.`
            : "The schedule shared by your school."
        }
      />
      <ChildPicker />

      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Timetable unavailable"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !weeklyTotal ? (
        <EmptyState
          title="No timetable yet"
          body="Your school has not published a timetable for this student’s current class."
        />
      ) : (
        <>
          <View style={styles.summary}>
            <View style={styles.summaryIcon}>
              <CalendarDays size={18} color={colors.blue} strokeWidth={2.1} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryTitle}>
                {weeklyTotal} lesson{weeklyTotal === 1 ? "" : "s"} a week
              </Text>
              <Text style={styles.summarySub}>
                {daysWithLessons.length} school day{daysWithLessons.length === 1 ? "" : "s"} ·{" "}
                {active.lessons.length} on {active.full}
              </Text>
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRail}
          >
            {visibleDays.map((day) => {
              const selected = day.index === activeDay;
              const isToday = day.index === TODAY;
              return (
                <Pressable
                  key={day.index}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${day.full}, ${day.lessons.length} lessons`}
                  onPress={() => setChosenDay(day.index)}
                  style={[styles.dayChip, selected && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipLabel, selected && styles.dayChipLabelActive]}>
                    {day.short}
                  </Text>
                  <Text style={[styles.dayChipCount, selected && styles.dayChipCountActive]}>
                    {day.lessons.length}
                  </Text>
                  {isToday ? (
                    <View style={[styles.todayDot, selected && styles.todayDotActive]} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>

          {active.lessons.length === 0 ? (
            <Card style={styles.freeDay}>
              <Text style={styles.freeDayTitle}>No lessons on {active.full}</Text>
              <Text style={styles.freeDayBody}>
                Enjoy the break — the next school day is in the list above.
              </Text>
            </Card>
          ) : (
            <View style={styles.timeline}>
              {active.lessons.map((lesson, index) => {
                const accent = ACCENTS[index % ACCENTS.length];
                const last = index === active.lessons.length - 1;
                return (
                  <View key={lesson.id} style={styles.row}>
                    <View style={styles.timeColumn}>
                      <Text style={styles.startTime}>{lesson.starts_at}</Text>
                      <Text style={styles.endTime}>{lesson.ends_at}</Text>
                    </View>
                    <View style={styles.rail}>
                      <View style={[styles.dot, { backgroundColor: accent }]} />
                      {!last ? <View style={styles.line} /> : null}
                    </View>
                    <Card style={{ ...styles.lessonCard, borderLeftColor: accent }}>
                      <Text style={styles.subject}>{lesson.subject_name}</Text>
                      <View style={styles.metaRow}>
                        <UserRound size={12} color={colors.muted} strokeWidth={2} />
                        <Text style={styles.meta} numberOfLines={1}>
                          {lesson.teacher_name}
                        </Text>
                      </View>
                      <View style={styles.metaRow}>
                        {lesson.room ? (
                          <>
                            <MapPin size={12} color={colors.muted} strokeWidth={2} />
                            <Text style={styles.meta}>{lesson.room}</Text>
                          </>
                        ) : (
                          <>
                            <Clock3 size={12} color={colors.muted} strokeWidth={2} />
                            <Text style={styles.meta}>
                              {lesson.starts_at} – {lesson.ends_at}
                            </Text>
                          </>
                        )}
                      </View>
                    </Card>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E7FC",
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  summaryTitle: { color: colors.blueDeep, fontSize: 12.5, fontWeight: "800" },
  summarySub: { color: "#5C7BA6", fontSize: 10 },
  dayRail: { flexDirection: "row", gap: 8, paddingVertical: 2 },
  dayChip: {
    minWidth: 58,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 1,
  },
  dayChipActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  dayChipLabel: { color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.3 },
  dayChipLabelActive: { color: "#EAF1FF" },
  dayChipCount: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  dayChipCountActive: { color: "#FFFFFF" },
  todayDot: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.blue,
  },
  todayDotActive: { backgroundColor: "#7FF0C4" },
  timeline: { gap: 0 },
  row: { flexDirection: "row", alignItems: "stretch" },
  timeColumn: { width: 46, paddingTop: 12, alignItems: "flex-end", gap: 1 },
  startTime: { color: colors.ink, fontSize: 11.5, fontWeight: "800" },
  endTime: { color: colors.mutedLight, fontSize: 9.5 },
  rail: { width: 22, alignItems: "center", paddingTop: 16 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { flex: 1, width: 2, backgroundColor: "#E4EBF6", marginTop: 3, marginBottom: -2 },
  lessonCard: {
    flex: 1,
    marginLeft: 4,
    marginBottom: 10,
    padding: 12,
    gap: 4,
    borderLeftWidth: 3,
  },
  subject: { color: colors.ink, fontSize: 13.5, fontWeight: "800" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  meta: { color: colors.muted, fontSize: 10.5, flexShrink: 1 },
  freeDay: { alignItems: "center", padding: 22, gap: 5 },
  freeDayTitle: { color: colors.ink, fontSize: 13, fontWeight: "800" },
  freeDayBody: {
    color: colors.muted,
    fontSize: 10.5,
    textAlign: "center",
    lineHeight: 15,
    maxWidth: 260,
  },
});
