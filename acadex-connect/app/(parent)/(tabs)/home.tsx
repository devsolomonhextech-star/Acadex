import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  BookOpenCheck,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Megaphone,
  Menu,
  ShieldCheck,
  UserRound,
} from "lucide-react-native";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiErrorMessage } from "../../../src/api/client";
import { EmptyState, LoadingState, Screen } from "../../../src/components/ui";
import { communicationsApi } from "../../../src/features/communicationsApi";
import { familyApi } from "../../../src/features/familyApi";
import { useAuth } from "../../../src/services/auth";
import { useChildren } from "../../../src/services/parentData";
import { colors } from "../../../src/theme/tokens";

const logo = require("../../../assets/images/acadex-logo.png");

export default function HomeScreen() {
  const router = useRouter();
  const { parent } = useAuth();
  const { children, selectedChild, selectChild } = useChildren();
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
  const unread =
    notifications.data?.filter((item) => !item.read_at).length ?? 0;
  const presentCount = attendance.data?.counts.present ?? 0;
  const recordedCount = attendance.data?.total_recorded ?? 0;
  const formattedPaid = fees.data
    ? `${fees.data.currency ?? ""} ${Number(fees.data.paid_total).toLocaleString()}`.trim()
    : "—";
  const averageGrade =
    term?.aggregate_percent != null
      ? `${Math.round(Number(term.aggregate_percent))}%`
      : (term?.grade ?? "—");

  return (
    <Screen
      contentStyle={styles.screen}
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
      <View style={styles.topbar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          onPress={() => router.push("/(parent)/(tabs)/profile")}
          style={styles.topbarButton}
        >
          <Menu color={colors.ink} size={22} />
        </Pressable>
        <Image source={logo} resizeMode="contain" style={styles.logo} />
        <View style={styles.topbarRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unread} unread updates`}
            onPress={() => router.push("/(parent)/(tabs)/notifications")}
            style={styles.bellButton}
          >
            <Bell color={colors.ink} size={20} />
            {unread > 0 ? <View style={styles.bellDot} /> : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/(parent)/(tabs)/profile")}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>
              {initials(parent?.display_name)}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.welcome}>
        <Text style={styles.greeting}>Good {dayGreeting()},</Text>
        <Text style={styles.parentName}>
          {parent?.display_name.split(" ")[0] ?? "there"} 👋
        </Text>
        <Text style={styles.caption}>
          Here’s an overview of your child’s progress.
        </Text>
      </View>

      {children.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.childPickerRow}
        >
          {children.map((child) => {
            const active = child.id === selectedChild?.id;
            return (
              <Pressable
                key={child.id}
                accessibilityRole="button"
                accessibilityLabel={`View ${child.first_name} ${child.last_name}`}
                onPress={() => selectChild(child.id)}
                style={[styles.childCard, active && styles.childCardActive]}
              >
                <View style={styles.childAvatar}>
                  <UserRound color={colors.blue} size={25} strokeWidth={2.2} />
                </View>
                <View style={styles.childInfo}>
                  <View style={styles.childNameRow}>
                    <Text style={styles.childName} numberOfLines={1}>
                      {child.first_name} {child.last_name}
                    </Text>
                    {child.class_name ? (
                      <Text style={styles.classPill}>{child.class_name}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.schoolName} numberOfLines={1}>
                    {parent?.school_name ?? "Acadex school"}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.mutedLight} />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {selectedChild ? (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.metricsRow}
          >
            <MetricCard
              icon={<CalendarDays color={colors.blue} size={19} />}
              title="Attendance"
              value={
                attendance.isLoading
                  ? "…"
                  : recordedCount
                    ? `${presentCount}/${recordedCount}`
                    : "—"
              }
              detail="Present"
              onPress={() => router.push("/(parent)/attendance")}
            />
            <MetricCard
              icon={<BookOpenCheck color={colors.blue} size={19} />}
              title="Average grade"
              value={reports.isLoading ? "…" : averageGrade}
              detail={term?.term_name ?? "Latest report"}
              onPress={() => router.push("/(parent)/(tabs)/academics")}
            />
            <MetricCard
              icon={<CircleDollarSign color={colors.blue} size={19} />}
              title="Fees paid"
              value={fees.isLoading ? "…" : formattedPaid}
              detail="All recorded"
              onPress={() => router.push("/(parent)/fees")}
            />
            <MetricCard
              icon={<CalendarDays color={colors.blue} size={19} />}
              title="Upcoming"
              value={events.isLoading ? "…" : String(events.data?.length ?? 0)}
              detail="School events"
              onPress={() => router.push("/(parent)/timetable")}
            />
          </ScrollView>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Recent attendance</Text>
            <Pressable onPress={() => router.push("/(parent)/attendance")}>
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
          </View>
          <View style={styles.attendanceCard}>
            {attendance.isLoading ? (
              <LoadingState />
            ) : attendance.error ? (
              <Text style={styles.mutedText}>
                Attendance is unavailable right now.
              </Text>
            ) : attendance.data?.records.length ? (
              <View style={styles.weekStrip}>
                {attendance.data.records.slice(0, 5).map((record) => (
                  <View
                    key={`${record.date}-${record.status}`}
                    style={styles.dayItem}
                  >
                    <Text style={styles.dayName}>
                      {new Date(`${record.date}T00:00:00`).toLocaleDateString(
                        undefined,
                        { weekday: "short" },
                      )}
                    </Text>
                    <Text style={styles.dayNumber}>
                      {new Date(`${record.date}T00:00:00`).getDate()}
                    </Text>
                    <Text style={styles.dayMonth}>
                      {new Date(`${record.date}T00:00:00`).toLocaleDateString(
                        undefined,
                        { month: "short" },
                      )}
                    </Text>
                    <View
                      style={[
                        styles.attendanceMark,
                        record.status === "present"
                          ? styles.attendancePresent
                          : record.status === "late"
                            ? styles.attendanceLate
                            : styles.attendanceAbsent,
                      ]}
                    >
                      {record.status === "present" ? (
                        <Check color="#fff" size={13} strokeWidth={3} />
                      ) : (
                        <Text style={styles.markText}>
                          {record.status === "late" ? "–" : "×"}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>No attendance records yet.</Text>
            )}
          </View>

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Latest announcement</Text>
            <Pressable onPress={() => router.push("/(parent)/announcements")}>
              <Text style={styles.viewAll}>View all</Text>
            </Pressable>
          </View>
          {announcements.isLoading ? (
            <LoadingState />
          ) : announcements.error ? (
            <EmptyState
              title="Updates unavailable"
              body={apiErrorMessage(announcements.error)}
              retry={() => void announcements.refetch()}
            />
          ) : latestAnnouncement ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(parent)/announcements")}
              style={styles.announcementCard}
            >
              <View style={styles.announcementIcon}>
                <Megaphone color={colors.blue} size={20} />
              </View>
              <View style={styles.announcementInfo}>
                <View style={styles.announcementTitleRow}>
                  <Text style={styles.announcementTitle} numberOfLines={1}>
                    {latestAnnouncement.title}
                  </Text>
                  <Text style={styles.newPill}>New</Text>
                </View>
                <Text style={styles.announcementBody} numberOfLines={1}>
                  {latestAnnouncement.body}
                </Text>
                <Text style={styles.announcementDate}>
                  {new Date(
                    latestAnnouncement.published_at,
                  ).toLocaleDateString()}
                </Text>
              </View>
              <ChevronRight color={colors.mutedLight} size={19} />
            </Pressable>
          ) : (
            <View style={styles.announcementCard}>
              <View style={styles.announcementIcon}>
                <Megaphone color={colors.blue} size={20} />
              </View>
              <Text style={styles.mutedText}>
                School announcements will appear here.
              </Text>
            </View>
          )}

          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Quick actions</Text>
          </View>
          <View style={styles.quickGrid}>
            <QuickAction
              icon={<BookOpenCheck color={colors.blue} size={19} />}
              title="View grades"
              onPress={() => router.push("/(parent)/(tabs)/academics")}
            />
            <QuickAction
              icon={<CreditCard color={colors.blue} size={19} />}
              title="Fees"
              onPress={() => router.push("/(parent)/fees")}
            />
            <QuickAction
              icon={<CalendarDays color={colors.blue} size={19} />}
              title="Attendance"
              onPress={() => router.push("/(parent)/attendance")}
            />
            <QuickAction
              icon={<Bell color={colors.blue} size={19} />}
              title="Updates"
              onPress={() => router.push("/(parent)/(tabs)/notifications")}
            />
          </View>

          {latestNotification ? (
            <Pressable
              onPress={() => router.push("/(parent)/(tabs)/notifications")}
              style={styles.notificationHint}
            >
              <Clock3 color={colors.blue} size={17} />
              <Text style={styles.notificationHintText} numberOfLines={1}>
                {latestNotification.title}
              </Text>
              <ArrowRight color={colors.blue} size={16} />
            </Pressable>
          ) : null}
        </>
      ) : null}

      <View style={styles.privacy}>
        <ShieldCheck size={15} color={colors.blue} />
        <Text style={styles.privacyText}>
          Your child’s records are private to your verified family account.
        </Text>
      </View>
    </Screen>
  );
}

function MetricCard({
  icon,
  title,
  value,
  detail,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.metricCard}
    >
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricDetail} numberOfLines={1}>
        {detail}
      </Text>
    </Pressable>
  );
}

function QuickAction({
  icon,
  title,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.quickAction}
    >
      <View style={styles.quickIcon}>{icon}</View>
      <Text style={styles.quickTitle}>{title}</Text>
    </Pressable>
  );
}

function initials(name?: string) {
  return (name ?? "A")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function dayGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 17, paddingTop: 9, paddingBottom: 26, gap: 13 },
  topbar: { flexDirection: "row", alignItems: "center", height: 43, gap: 8 },
  topbarButton: { width: 34, height: 38, justifyContent: "center" },
  logo: { width: 94, height: 30 },
  topbarRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  bellButton: {
    width: 30,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  bellDot: {
    position: "absolute",
    right: 2,
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 5,
    backgroundColor: colors.blue,
    borderWidth: 1,
    borderColor: "#fff",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D5E4FF",
  },
  avatarText: { color: colors.blue, fontSize: 12, fontWeight: "800" },
  welcome: { paddingTop: 6, gap: 0 },
  greeting: {
    color: colors.ink,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "600",
  },
  parentName: {
    color: colors.ink,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  caption: { color: colors.muted, fontSize: 12, marginTop: 6 },
  childPickerRow: { gap: 8 },
  childCard: {
    width: 320,
    minHeight: 76,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
  },
  childCardActive: { borderColor: "#D8E6FF" },
  childAvatar: {
    width: 52,
    height: 52,
    borderRadius: 27,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F2F7FF",
  },
  childInfo: { flex: 1, gap: 5 },
  childNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  childName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    flexShrink: 1,
  },
  classPill: {
    color: colors.blue,
    backgroundColor: colors.blueSoft,
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "700",
    overflow: "hidden",
  },
  schoolName: { color: colors.muted, fontSize: 10 },
  metricsRow: { gap: 9, paddingRight: 4 },
  metricCard: {
    width: 82,
    minHeight: 127,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 10,
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  metricTitle: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
  },
  metricValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 7,
    maxWidth: "100%",
  },
  metricDetail: {
    color: colors.blue,
    fontSize: 9,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  viewAll: { color: colors.blue, fontSize: 11, fontWeight: "600" },
  attendanceCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 9,
    paddingVertical: 13,
    minHeight: 94,
    justifyContent: "center",
  },
  weekStrip: { flexDirection: "row", justifyContent: "space-between", gap: 4 },
  dayItem: { alignItems: "center", minWidth: 42, gap: 1 },
  dayName: { color: colors.muted, fontSize: 9 },
  dayNumber: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  dayMonth: { color: colors.mutedLight, fontSize: 9 },
  attendanceMark: {
    width: 19,
    height: 19,
    borderRadius: 10,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  attendancePresent: { backgroundColor: colors.blue },
  attendanceLate: { backgroundColor: "#DCEAFF" },
  attendanceAbsent: { backgroundColor: "#EFF3F9" },
  markText: {
    color: colors.blueDeep,
    fontWeight: "800",
    fontSize: 13,
    lineHeight: 15,
  },
  mutedText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  announcementCard: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 74,
  },
  announcementIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  announcementInfo: { flex: 1, gap: 4 },
  announcementTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  announcementTitle: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    flexShrink: 1,
  },
  newPill: {
    color: colors.blue,
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8,
    fontWeight: "700",
    overflow: "hidden",
  },
  announcementBody: { color: colors.muted, fontSize: 10 },
  announcementDate: { color: colors.mutedLight, fontSize: 9 },
  quickGrid: { flexDirection: "row", gap: 8 },
  quickAction: {
    flex: 1,
    minHeight: 77,
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  quickTitle: { color: colors.ink, fontSize: 9, fontWeight: "600" },
  notificationHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 13,
    backgroundColor: "#EEF5FF",
    borderWidth: 1,
    borderColor: "#DDEAFF",
    padding: 11,
  },
  notificationHintText: { color: colors.ink, fontSize: 10, flex: 1 },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 3,
    marginTop: 1,
  },
  privacyText: { flex: 1, color: colors.muted, fontSize: 9, lineHeight: 14 },
});
