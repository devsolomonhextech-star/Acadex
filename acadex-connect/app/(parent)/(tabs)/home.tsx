import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Megaphone,
  ShieldCheck,
  UsersRound,
} from "lucide-react-native";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../../src/api/client";
import {
  Card,
  EmptyState,
  Heading,
  LoadingState,
  Screen,
} from "../../../src/components/ui";
import { ChildPicker } from "../../../src/components/ChildPicker";
import { communicationsApi } from "../../../src/features/communicationsApi";
import { familyApi } from "../../../src/features/familyApi";
import { useAuth } from "../../../src/services/auth";
import { useChildren } from "../../../src/services/parentData";
import { colors, radius } from "../../../src/theme/tokens";

export default function HomeScreen() {
  const router = useRouter();
  const { parent } = useAuth();
  const { selectedChild } = useChildren();
  const reports = useQuery({
    queryKey: ["reports", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.reports(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const fees = useQuery({
    queryKey: ["fees", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.fees(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const attendance = useQuery({
    queryKey: ["attendance", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.attendance(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const events = useQuery({
    queryKey: ["events", selectedChild?.id],
    queryFn: ({ signal }) => familyApi.events(selectedChild!.id, signal),
    enabled: !!selectedChild,
  });
  const announcements = useQuery({
    queryKey: ["announcements"],
    queryFn: ({ signal }) => communicationsApi.announcements(signal),
  });
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => communicationsApi.notifications(signal),
  });
  const refresh = () => {
    void reports.refetch();
    void fees.refetch();
    void attendance.refetch();
    void announcements.refetch();
    void events.refetch();
    void notifications.refetch();
  };
  const term = reports.data?.[0];
  const latestAnnouncement = announcements.data?.[0];
  const latestNotification = notifications.data?.[0];

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={
            reports.isRefetching ||
            fees.isRefetching ||
            attendance.isRefetching ||
            announcements.isRefetching ||
            events.isRefetching ||
            notifications.isRefetching
          }
          onRefresh={refresh}
          tintColor={colors.blue}
        />
      }
    >
      <View style={styles.welcome}>
        <View style={{ flex: 1 }}>
          <Text style={styles.school}>{parent?.school_name}</Text>
          <Text style={styles.greeting}>
            Good day, {parent?.display_name.split(" ")[0]}.
          </Text>
          <Text style={styles.caption}>
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · Here’s what’s happening with your family.
          </Text>
        </View>
        <View style={styles.profile}>
          <Text style={styles.profileText}>
            {parent?.display_name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase()}
          </Text>
        </View>
      </View>
      <View style={styles.section}>
        <Heading
          title="Your children"
          subtitle="Choose a child to see their school information."
        />
        <ChildPicker />
      </View>
      {selectedChild ? (
        <>
          <View style={styles.quickGrid}>
            <QuickAction
              icon={<CalendarDays color={colors.blue} size={20} />}
              title="Attendance"
              detail="Daily record"
              onPress={() => router.push("/(parent)/attendance")}
            />
            <QuickAction
              icon={<CreditCard color={colors.blue} size={20} />}
              title="Fees"
              detail="Balances & receipts"
              onPress={() => router.push("/(parent)/fees")}
            />
            <QuickAction
              icon={<ClipboardList color={colors.blue} size={20} />}
              title="Timetable"
              detail="Weekly lessons"
              onPress={() => router.push("/(parent)/timetable")}
            />
            <QuickAction
              icon={<UsersRound color={colors.blue} size={20} />}
              title="School updates"
              detail="News & notices"
              onPress={() => router.push("/(parent)/announcements")}
            />
          </View>
          <Card style={styles.summary}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionTitle}>Latest report</Text>
                <Text style={styles.sectionCaption}>
                  {selectedChild.first_name} {selectedChild.last_name}
                </Text>
              </View>
              <Pressable
                onPress={() => router.push("/(parent)/(tabs)/academics")}
              >
                <ChevronRight size={20} color={colors.blue} />
              </Pressable>
            </View>
            {reports.isLoading ? (
              <LoadingState />
            ) : reports.error ? (
              <Text style={styles.notice}>
                {apiErrorMessage(reports.error)}
              </Text>
            ) : term ? (
              <View style={styles.reportRow}>
                <View style={styles.scoreBadge}>
                  <Text style={styles.score}>
                    {term.grade ??
                      (term.aggregate_percent != null
                        ? `${Math.round(Number(term.aggregate_percent))}%`
                        : "—")}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTerm}>
                    {term.term_name} · {term.academic_year_name}
                  </Text>
                  <Text style={styles.reportCaption}>
                    {term.published_at
                      ? "Published by the school"
                      : "Publication date unavailable"}
                  </Text>
                </View>
              </View>
            ) : (
              <Text style={styles.notice}>
                No published report is available for this child yet.
              </Text>
            )}
          </Card>
          <Card style={styles.balance}>
            <View style={styles.balanceIcon}>
              <CreditCard size={18} color={colors.blue} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.balanceLabel}>Outstanding fees</Text>
              <Text style={styles.balanceValue}>
                {fees.isLoading
                  ? "Loading…"
                  : fees.data
                    ? `${fees.data.currency ?? ""} ${Number(fees.data.outstanding_total).toLocaleString()}`.trim()
                    : "Unavailable"}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/(parent)/fees")}>
              <ChevronRight size={19} color={colors.blue} />
            </Pressable>
          </Card>
          <Card style={styles.summary}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionTitle}>Attendance</Text>
                <Text style={styles.sectionCaption}>
                  School-recorded entries
                </Text>
              </View>
              <Pressable onPress={() => router.push("/(parent)/attendance")}>
                <ChevronRight size={20} color={colors.blue} />
              </Pressable>
            </View>
            {attendance.isLoading ? (
              <Text style={styles.notice}>Loading attendance…</Text>
            ) : attendance.error ? (
              <Text style={styles.notice}>
                Attendance is unavailable right now.
              </Text>
            ) : attendance.data?.total_recorded ? (
              <View style={styles.attendanceTotals}>
                <Text style={styles.attendanceValue}>
                  <Text style={{ color: colors.success }}>
                    {attendance.data.counts.present}
                  </Text>{" "}
                  present
                </Text>
                <Text style={styles.attendanceValue}>
                  <Text style={{ color: colors.danger }}>
                    {attendance.data.counts.absent}
                  </Text>{" "}
                  absent
                </Text>
                <Text style={styles.attendanceValue}>
                  <Text style={{ color: colors.warning }}>
                    {attendance.data.counts.late}
                  </Text>{" "}
                  late
                </Text>
              </View>
            ) : (
              <Text style={styles.notice}>No attendance records yet.</Text>
            )}
          </Card>
        </>
      ) : null}
      <View style={styles.section}>
        <Heading title="Coming up" />
        {events.isLoading ? (
          <LoadingState />
        ) : events.error ? (
          <EmptyState
            title="Calendar unavailable"
            body={apiErrorMessage(events.error)}
            retry={() => void events.refetch()}
          />
        ) : events.data?.length ? (
          events.data.slice(0, 2).map((event) => (
            <Card key={event.id} style={styles.event}>
              <View style={styles.eventDate}>
                <Text style={styles.eventDay}>
                  {new Date(`${event.starts_on}T00:00:00`).getDate()}
                </Text>
                <Text style={styles.eventMonth}>
                  {new Date(`${event.starts_on}T00:00:00`)
                    .toLocaleDateString(undefined, { month: "short" })
                    .toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <Text style={styles.eventMeta}>
                  {new Date(`${event.starts_on}T00:00:00`).toLocaleDateString(
                    undefined,
                    { weekday: "long", month: "long", day: "numeric" },
                  )}{" "}
                  · {event.category}
                </Text>
              </View>
            </Card>
          ))
        ) : (
          <Text style={styles.notice}>
            No upcoming school events have been shared for this child.
          </Text>
        )}
      </View>
      <View style={styles.section}>
        <Heading
          title="Recent notification"
          action={
            <Pressable
              onPress={() => router.push("/(parent)/(tabs)/notifications")}
            >
              <Text style={styles.viewAll}>All updates</Text>
            </Pressable>
          }
        />
        {notifications.isLoading ? (
          <LoadingState />
        ) : notifications.error ? (
          <Text style={styles.notice}>
            Notifications are unavailable right now.
          </Text>
        ) : latestNotification ? (
          <Card>
            <Text style={styles.announcementTitle}>
              {latestNotification.title}
            </Text>
            <Text style={styles.announcementBody} numberOfLines={2}>
              {latestNotification.body}
            </Text>
            <Text style={styles.announcementDate}>
              {new Date(latestNotification.created_at).toLocaleString()}
            </Text>
          </Card>
        ) : (
          <Text style={styles.notice}>No recent account notifications.</Text>
        )}
      </View>
      <View style={styles.section}>
        <Heading
          title="School announcements"
          action={
            <Pressable onPress={() => router.push("/(parent)/announcements")}>
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
          }
        />
        {announcements.isLoading ? (
          <LoadingState />
        ) : announcements.error ? (
          <EmptyState
            title="Updates are unavailable"
            body={apiErrorMessage(announcements.error)}
            retry={() => void announcements.refetch()}
          />
        ) : latestAnnouncement ? (
          <Card>
            <View style={styles.announcementHead}>
              <Megaphone color={colors.blue} size={18} />
              <Text style={styles.announcementDate}>
                {new Date(latestAnnouncement.published_at).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.announcementTitle}>
              {latestAnnouncement.title}
            </Text>
            <Text style={styles.announcementBody} numberOfLines={3}>
              {latestAnnouncement.body}
            </Text>
          </Card>
        ) : (
          <EmptyState
            title="No announcements yet"
            body="School notices shared with your family will appear here."
          />
        )}
      </View>
      <View style={styles.privacy}>
        <ShieldCheck size={16} color={colors.success} />
        <Text style={styles.privacyText}>
          Your child’s records are private to your verified family account.
        </Text>
      </View>
    </Screen>
  );
}

function QuickAction({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.quickIcon}>{icon}</View>
      <Text style={styles.quickTitle}>{title}</Text>
      <Text style={styles.quickDetail}>{detail}</Text>
      <ChevronRight
        size={15}
        color={colors.mutedLight}
        style={styles.quickArrow}
      />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  welcome: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  school: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  greeting: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  caption: { color: colors.muted, fontSize: 13, marginTop: 3 },
  profile: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  profileText: { fontWeight: "800", color: colors.blue, fontSize: 13 },
  section: { gap: 8, marginTop: 6 },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quick: {
    width: "48%",
    flexGrow: 1,
    minHeight: 128,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    gap: 7,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  quickDetail: { color: colors.muted, fontSize: 11 },
  quickArrow: { position: "absolute", right: 12, top: 15 },
  summary: { padding: 16 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  sectionCaption: { color: colors.muted, fontSize: 12, marginTop: 2 },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 13,
  },
  scoreBadge: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  score: { color: colors.blueDeep, fontSize: 16, fontWeight: "800" },
  reportTerm: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  reportCaption: { color: colors.muted, fontSize: 11, marginTop: 4 },
  notice: { color: colors.muted, fontSize: 13, lineHeight: 20, paddingTop: 8 },
  event: { flexDirection: "row", alignItems: "center", gap: 12, padding: 13 },
  eventDate: {
    width: 44,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  eventDay: { color: colors.blueDeep, fontSize: 17, fontWeight: "800" },
  eventMonth: { color: colors.blue, fontSize: 9, fontWeight: "800" },
  eventTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  eventMeta: {
    color: colors.muted,
    fontSize: 10,
    marginTop: 4,
    textTransform: "capitalize",
  },
  balance: { flexDirection: "row", alignItems: "center", padding: 14 },
  attendanceTotals: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    paddingTop: 12,
  },
  attendanceValue: { color: colors.muted, fontSize: 12, fontWeight: "600" },
  balanceIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  balanceLabel: { color: colors.muted, fontSize: 12 },
  balanceValue: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
  },
  viewAll: { color: colors.blue, fontSize: 12, fontWeight: "700" },
  announcementHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  announcementDate: { color: colors.muted, fontSize: 11 },
  announcementTitle: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  announcementBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  privacyText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 16 },
});
