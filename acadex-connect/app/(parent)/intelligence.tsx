import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  CalendarCheck2,
  CalendarX2,
  ClipboardList,
  Info,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiErrorMessage } from "../../src/api/client";
import { ChildSwitcher } from "../../src/components/ChildSwitcher";
import { PageHeader } from "../../src/components/insights/PageHeader";
import { PressableScale } from "../../src/components/insights/InsightVisuals";
import { EmptyState, LoadingState } from "../../src/components/ui";
import { familyApi } from "../../src/features/familyApi";
import { insightColors } from "../../src/features/insights";
import { notificationRoute } from "../../src/lib/notificationRoutes";
import { useChildren } from "../../src/services/parentData";
import type { ParentInsight } from "../../src/types/models";

const KIND_ICONS: Record<string, LucideIcon> = {
  attendance_weekday_pattern: CalendarX2,
  attendance_declined: TrendingDown,
  attendance_improved: TrendingUp,
  attendance_full: CalendarCheck2,
  assignments_due: ClipboardList,
  subject_improved: TrendingUp,
  subject_declined: TrendingDown,
  fees_outstanding: Wallet,
};

export default function IntelligenceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    selectedChild,
    isLoading: childrenLoading,
    error: childrenError,
  } = useChildren();
  const query = useQuery({
    queryKey: ["intelligence", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.intelligence(selectedChild!.id, signal),
    enabled: !!selectedChild,
    staleTime: 60_000,
  });

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(parent)/(tabs)/home");
  };

  const items = query.data?.items ?? [];
  const attention = items.filter((item) => item.tone === "attention").length;
  const positive = items.filter((item) => item.tone === "positive").length;

  return (
    <View style={styles.screen}>
      <PageHeader
        title="Parent Intelligence"
        subtitle={
          selectedChild
            ? `What needs attention for ${selectedChild.first_name}`
            : "Verified signals from school records"
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
              <Sparkles size={26} color={insightColors.blue} strokeWidth={1.9} />
              <Text style={styles.emptyTitle}>No child selected</Text>
              <Text style={styles.emptyBody}>
                Link a child to this parent account to see what needs attention.
              </Text>
            </View>
          )
        ) : query.isLoading ? (
          <LoadingState />
        ) : query.error ? (
          <EmptyState
            title="Intelligence could not load"
            body={apiErrorMessage(query.error)}
            retry={() => void query.refetch()}
          />
        ) : !items.length ? (
          <View style={styles.emptyCard}>
            <Sparkles size={26} color={insightColors.blue} strokeWidth={1.9} />
            <Text style={styles.emptyTitle}>Nothing needs attention</Text>
            <Text style={styles.emptyBody}>
              Acadex only raises an insight when your school’s records support
              it. Right now there is nothing unusual to flag.
            </Text>
          </View>
        ) : (
          <>
            <Animated.View entering={FadeInDown.duration(380)} style={styles.summary}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: insightColors.amberText }]}>
                  {attention}
                </Text>
                <Text style={styles.summaryLabel}>
                  need{attention === 1 ? "s" : ""} attention
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: insightColors.green }]}>
                  {positive}
                </Text>
                <Text style={styles.summaryLabel}>going well</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{items.length}</Text>
                <Text style={styles.summaryLabel}>verified signals</Text>
              </View>
            </Animated.View>

            {items.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInUp.delay(90 + index * 60).duration(360)}
              >
                <InsightCard
                  insight={item}
                  onPress={() => {
                    const route = notificationRoute(item.link);
                    if (route) router.push(route);
                  }}
                />
              </Animated.View>
            ))}

            <Animated.View entering={FadeInUp.delay(200).duration(380)} style={styles.infoCard}>
              <View style={styles.infoIcon}>
                <Info size={17} color={insightColors.blue} strokeWidth={2} />
              </View>
              <Text style={styles.infoText}>
                Every insight is calculated from records your school saved:
                attendance registers, the gradebook, the assessment list and the
                fee ledger. Missing records are never treated as absences or low
                scores, and each card shows the evidence it used.
              </Text>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function InsightCard({
  insight,
  onPress,
}: {
  insight: ParentInsight;
  onPress: () => void;
}) {
  const Icon = KIND_ICONS[insight.kind] ?? Sparkles;
  const palette =
    insight.tone === "attention"
      ? { color: insightColors.amberText, soft: insightColors.amberSoft }
      : insight.tone === "positive"
        ? { color: insightColors.green, soft: insightColors.greenSoft }
        : { color: insightColors.blue, soft: insightColors.blueSoft };
  return (
    <PressableScale
      accessibilityLabel={`${insight.title}. ${insight.detail}`}
      onPress={onPress}
      style={[styles.card, { borderLeftColor: palette.color }]}
    >
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, { backgroundColor: palette.soft }]}>
          <Icon size={18} color={palette.color} strokeWidth={2.1} />
        </View>
        <Text style={styles.cardTitle}>{insight.title}</Text>
      </View>
      <Text style={styles.cardDetail}>{insight.detail}</Text>
      <View style={styles.evidenceRow}>
        <ShieldCheck size={13} color={insightColors.muted} strokeWidth={2} />
        <Text style={styles.evidenceText}>
          {insight.source} · {insight.evidence}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: insightColors.page },
  content: { paddingHorizontal: 16, gap: 12 },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: insightColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: insightColors.border,
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 3 },
  summaryValue: {
    fontSize: 22,
    fontWeight: "800",
    color: insightColors.ink,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: insightColors.muted,
    textAlign: "center",
  },
  summaryDivider: {
    width: 1,
    height: 30,
    backgroundColor: insightColors.border,
  },
  card: {
    backgroundColor: insightColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: insightColors.border,
    borderLeftWidth: 4,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "800",
    color: insightColors.ink,
    lineHeight: 19,
  },
  cardDetail: {
    fontSize: 12.5,
    lineHeight: 18,
    color: insightColors.muted,
    fontWeight: "500",
  },
  evidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: insightColors.border,
    paddingTop: 8,
  },
  evidenceText: {
    flex: 1,
    fontSize: 10.5,
    lineHeight: 15,
    color: insightColors.mutedLight,
    fontWeight: "600",
  },
  emptyCard: {
    backgroundColor: insightColors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: insightColors.border,
    padding: 22,
    alignItems: "center",
    gap: 7,
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: insightColors.ink },
  emptyBody: {
    fontSize: 12.5,
    lineHeight: 19,
    color: insightColors.muted,
    textAlign: "center",
  },
  infoCard: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: insightColors.blueSoft,
    borderRadius: 16,
    padding: 13,
    marginTop: 2,
  },
  infoIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: insightColors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 17,
    color: insightColors.blueDeep,
    fontWeight: "600",
  },
});
