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
      <View style={styles.headerSection}>
        <ChildPicker />
        <Text style={styles.sectionTitle}>Published report cards</Text>
      </View>

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
        <View style={styles.list}>
          {query.data.map((report, index) => (
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
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                <Card style={styles.reportCard}>
                  {/* Top Row: Icon, Term Info, Grade */}
                  <View style={styles.cardHeader}>
                    <View style={styles.fileIcon}>
                      <FileText color={colors.blue} size={22} strokeWidth={2} />
                    </View>
                    <View style={styles.headerText}>
                      <Text style={styles.term}>{report.term_name}</Text>
                      <Text style={styles.year}>
                        {report.academic_year_name} Academic Year
                      </Text>
                    </View>
                    <View style={styles.gradeBadge}>
                      <Text style={styles.gradeText}>
                        {report.grade ??
                          (report.aggregate_percent == null
                            ? "—"
                            : `${Math.round(Number(report.aggregate_percent))}%`)}
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Bottom Row: Status & Action */}
                  <View style={styles.cardFooter}>
                    <View style={styles.publishedBadge}>
                      <Check size={12} color={colors.success} strokeWidth={3} />
                      <Text style={styles.publishedText}>Published</Text>
                    </View>
                    <View style={styles.actionLink}>
                      <Text style={styles.actionText}>View report card</Text>
                      <ArrowRight size={16} color={colors.blue} strokeWidth={2.5} />
                    </View>
                  </View>
                </Card>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      )}

      <Card style={styles.infoCard}>
        <LockKeyhole size={20} color={colors.success} strokeWidth={2} />
        <Text style={styles.infoText}>
          Only results officially published by your school appear here.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 12, gap: 16, paddingBottom: 30 },
  headerSection: { gap: 14, marginBottom: 4 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  list: { gap: 12 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  
  // Card Layout
  reportCard: {
    padding: 0, // Remove default card padding to allow full-width footer
    borderRadius: 20,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  fileIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, gap: 3 },
  term: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  year: { color: colors.muted, fontSize: 13, fontWeight: "500" },
  gradeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  gradeText: { fontSize: 14, fontWeight: "800", color: colors.blueDeep },
  
  // Card Footer
  divider: { height: 1, backgroundColor: colors.border, opacity: 0.6 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FAFAFA", // Slight tint to separate action area
  },
  publishedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  publishedText: { color: colors.success, fontSize: 11, fontWeight: "700" },
  actionLink: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { color: colors.blue, fontSize: 13, fontWeight: "700" },

  // Info Card
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: colors.successSoft,
    borderWidth: 1,
    borderColor: "#CDEBDD",
    padding: 16,
    borderRadius: 18,
    marginTop: 8,
  },
  infoText: { flex: 1, color: colors.success, fontSize: 13, lineHeight: 19, fontWeight: "500" },
});