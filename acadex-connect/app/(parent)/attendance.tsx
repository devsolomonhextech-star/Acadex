import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react-native";
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
import { colors, radius } from "../../src/theme/tokens";

const statuses = {
  present: { label: "Present", color: colors.success, bg: colors.successSoft },
  absent: { label: "Absent", color: colors.danger, bg: colors.dangerSoft },
  late: { label: "Late", color: colors.warning, bg: colors.warningSoft },
  excused: { label: "Excused", color: colors.info, bg: colors.infoSoft },
} as const;
export default function AttendanceScreen() {
  const { selectedChild } = useChildren();
  const query = useQuery({
    queryKey: ["attendance", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.attendance(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
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
        title="Attendance"
        subtitle={
          selectedChild
            ? `${selectedChild.first_name} ${selectedChild.last_name} · recorded school days`
            : "Attendance shared by the school."
        }
      />
      <ChildPicker />
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Attendance could not load"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.records.length ? (
        <EmptyState
          title="No attendance recorded"
          body="Daily attendance will appear here once the school records it."
        />
      ) : (
        <>
          <View style={styles.countGrid}>
            {(Object.keys(statuses) as (keyof typeof statuses)[]).map((key) => (
              <Card key={key} style={styles.count}>
                <Text style={styles.countValue}>
                  {query.data.counts[key] ?? 0}
                </Text>
                <Text style={styles.countLabel}>{statuses[key].label}</Text>
              </Card>
            ))}
          </View>
          <Card style={styles.note}>
            <CalendarDays size={17} color={colors.blue} />
            <Text style={styles.noteText}>
              These totals include only attendance entries saved by the school.
              Excused records are shown separately and are not counted as
              absences.
            </Text>
          </Card>
          <Text style={styles.section}>RECENT RECORDS</Text>
          {query.data.records.map((record, index) => {
            const badge = statuses[record.status];
            return (
              <Card key={`${record.date}-${index}`} style={styles.row}>
                <View style={styles.date}>
                  <Text style={styles.dateDay}>
                    {new Date(`${record.date}T00:00:00`).getDate()}
                  </Text>
                  <Text style={styles.dateMonth}>
                    {new Date(`${record.date}T00:00:00`).toLocaleDateString(
                      undefined,
                      { month: "short" },
                    )}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowDate}>
                    {new Date(`${record.date}T00:00:00`).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </Text>
                  {record.note ? (
                    <Text style={styles.noteSmall}>{record.note}</Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.badge,
                    { color: badge.color, backgroundColor: badge.bg },
                  ]}
                >
                  {badge.label}
                </Text>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  countGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  count: {
    flexGrow: 1,
    minWidth: "45%",
    alignItems: "center",
    paddingVertical: 16,
  },
  countValue: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  countLabel: { color: colors.muted, fontSize: 12, marginTop: 3 },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: colors.blueSoft,
    borderColor: "#D7E4FC",
  },
  noteText: { flex: 1, color: colors.blueDeep, fontSize: 12, lineHeight: 18 },
  section: {
    color: colors.mutedLight,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "800",
    marginTop: 4,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  date: {
    width: 42,
    height: 46,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { fontSize: 16, color: colors.blueDeep, fontWeight: "800" },
  dateMonth: { fontSize: 9, color: colors.blue, fontWeight: "700" },
  rowDate: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  noteSmall: { color: colors.muted, fontSize: 11, marginTop: 3 },
  badge: {
    overflow: "hidden",
    fontSize: 10,
    fontWeight: "700",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
  },
});
