import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FileText, LockKeyhole } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../../src/api/client";
import { ChildPicker } from "../../../src/components/ChildPicker";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../../src/components/ui";
import { familyApi } from "../../../src/features/familyApi";
import { useChildren } from "../../../src/services/parentData";
import { colors, radius } from "../../../src/theme/tokens";

export default function AcademicsScreen() {
  const router = useRouter();
  const { selectedChild } = useChildren();
  const query = useQuery({
    queryKey: ["reports", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.reports(selectedChild!.id, signal),
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
        title="Academics"
        subtitle="Published results shared by the school."
      />
      <ChildPicker />
      <Card style={styles.info}>
        <LockKeyhole size={17} color={colors.success} />
        <Text style={styles.infoText}>
          Only results officially published by your school appear here.
        </Text>
      </Card>
      {query.isLoading ? (
        <LoadingState />
      ) : query.error ? (
        <EmptyState
          title="Results could not load"
          body={apiErrorMessage(query.error)}
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <EmptyState
          title="No published results yet"
          body="When your school publishes a report card, it will appear here."
        />
      ) : (
        query.data.map((report) => (
          <Pressable
            key={report.term_id}
            onPress={() =>
              selectedChild &&
              router.push({
                pathname: "/(parent)/report-cards/[studentId]/[termId]",
                params: { studentId: selectedChild.id, termId: report.term_id },
              })
            }
            accessibilityRole="button"
            style={({ pressed }) => [pressed && { opacity: 0.75 }]}
          >
            <Card style={styles.report}>
              <View style={styles.file}>
                <FileText color={colors.blue} size={20} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.term}>{report.term_name}</Text>
                <Text style={styles.year}>
                  {report.academic_year_name} · Published{" "}
                  {new Date(report.published_at).toLocaleDateString()}
                </Text>
                <Text style={styles.link}>View report card</Text>
              </View>
              <View style={styles.grade}>
                <Text style={styles.gradeText}>
                  {report.grade ??
                    (report.aggregate_percent == null
                      ? "—"
                      : `${Math.round(Number(report.aggregate_percent))}%`)}
                </Text>
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.successSoft,
    borderColor: "#CDEBDD",
    padding: 13,
  },
  infoText: { flex: 1, color: colors.success, fontSize: 12, lineHeight: 18 },
  report: { flexDirection: "row", alignItems: "center", padding: 14 },
  file: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  term: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  year: { color: colors.muted, fontSize: 11, marginTop: 3 },
  link: { color: colors.blue, fontSize: 12, fontWeight: "700", marginTop: 8 },
  grade: {
    minWidth: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeText: { fontSize: 12, fontWeight: "800", color: colors.blueDeep },
});
