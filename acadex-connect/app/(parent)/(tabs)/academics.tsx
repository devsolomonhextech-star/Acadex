import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowRight, Check, FileText, LockKeyhole } from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { apiErrorMessage } from "../../../src/api/client";
import { ChildPicker } from "../../../src/components/ChildPicker";
import { ParentPageHeader } from "../../../src/components/ParentPageHeader";
import {
  Card,
  EmptyState,
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
      safeAreaTop
      contentStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          tintColor={colors.blue}
        />
      }
    >
      <ParentPageHeader
        title="Academics"
        subtitle="Published results and reports"
      />
      <ChildPicker />
      <Text style={styles.sectionTitle}>Published report cards</Text>

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
        query.data.map((report, index) => (
          <Animated.View
            key={report.term_id}
            entering={FadeInUp.delay(index * 55).duration(280)}
          >
            <Pressable
              onPress={() =>
                selectedChild &&
                router.push({
                  pathname: "/(parent)/report-cards/[studentId]/[termId]",
                  params: {
                    studentId: selectedChild.id,
                    termId: report.term_id,
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`View ${report.term_name} report card`}
              style={({ pressed }) => [pressed && { opacity: 0.75 }]}
            >
              <Card style={styles.report}>
                <View style={styles.file}>
                  <FileText color={colors.blue} size={23} />
                </View>
                <View style={styles.reportCopy}>
                  <Text style={styles.term}>{report.term_name}</Text>
                  <Text style={styles.year}>
                    {report.academic_year_name} Academic Year
                  </Text>
                  <View style={styles.published}>
                    <Check size={13} color={colors.success} strokeWidth={3} />
                    <Text style={styles.publishedText}>Published</Text>
                  </View>
                  <View style={styles.openLink}>
                    <Text style={styles.link}>View report card</Text>
                    <ArrowRight size={16} color={colors.blue} />
                  </View>
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
          </Animated.View>
        ))
      )}

      <Card style={styles.info}>
        <LockKeyhole size={19} color={colors.success} />
        <Text style={styles.infoText}>
          Only results officially published by your school appear here.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 12, gap: 16, paddingBottom: 30 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 2,
  },
  report: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 15,
    borderRadius: 19,
    gap: 13,
  },
  file: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  reportCopy: { flex: 1, minWidth: 0, gap: 4 },
  term: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  year: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  published: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  publishedText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  openLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 7,
  },
  link: { color: colors.blue, fontSize: 13, fontWeight: "700" },
  grade: {
    minWidth: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  gradeText: { fontSize: 13, fontWeight: "800", color: colors.blueDeep },
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: colors.successSoft,
    borderColor: "#CDEBDD",
    padding: 14,
    borderRadius: 17,
    marginTop: 2,
  },
  infoText: { flex: 1, color: colors.success, fontSize: 12, lineHeight: 18 },
});
