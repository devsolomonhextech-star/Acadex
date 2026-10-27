import { useQuery } from "@tanstack/react-query";
import { Clock3, MapPin } from "lucide-react-native";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
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

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
export default function TimetableScreen() {
  const { selectedChild } = useChildren();
  const query = useQuery({
    queryKey: ["timetable", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.timetable(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const grouped = days
    .map((day, index) => ({
      day,
      lessons: query.data?.filter((item) => item.day_of_week === index) ?? [],
    }))
    .filter((group) => group.lessons.length);
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
        title="Class timetable"
        subtitle={
          selectedChild
            ? `Weekly lessons for ${selectedChild.first_name}.`
            : "Schedule shared by the school."
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
      ) : !query.data?.length ? (
        <EmptyState
          title="No timetable available"
          body="Your school has not published a timetable for this student’s current class."
        />
      ) : (
        grouped.map((group) => (
          <View key={group.day} style={styles.day}>
            <Text style={styles.dayTitle}>{group.day}</Text>
            {group.lessons.map((lesson) => (
              <Card key={lesson.id} style={styles.lesson}>
                <View style={styles.time}>
                  <Clock3 size={15} color={colors.blue} />
                  <Text style={styles.timeText}>
                    {lesson.starts_at} – {lesson.ends_at}
                  </Text>
                </View>
                <Text style={styles.subject}>{lesson.subject_name}</Text>
                <Text style={styles.teacher}>{lesson.teacher_name}</Text>
                {lesson.room ? (
                  <View style={styles.room}>
                    <MapPin size={12} color={colors.muted} />
                    <Text style={styles.roomText}>{lesson.room}</Text>
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  day: { gap: 9 },
  dayTitle: {
    color: colors.blueDeep,
    fontSize: 14,
    fontWeight: "800",
    paddingLeft: 2,
  },
  lesson: {
    borderLeftColor: colors.blue,
    borderLeftWidth: 3,
    gap: 5,
    padding: 14,
  },
  time: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeText: { color: colors.blue, fontSize: 11, fontWeight: "700" },
  subject: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  teacher: { color: colors.muted, fontSize: 12 },
  room: { flexDirection: "row", alignItems: "center", gap: 4 },
  roomText: { color: colors.muted, fontSize: 11 },
});
