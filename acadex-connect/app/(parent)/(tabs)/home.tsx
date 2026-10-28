import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  ChevronUp,
  X,
  Zap,
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
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiErrorMessage } from "../../../src/api/client";
import { EmptyState, LoadingState, Screen } from "../../../src/components/ui";
import { communicationsApi } from "../../../src/features/communicationsApi";
import { familyApi } from "../../../src/features/familyApi";
import { useAuth } from "../../../src/services/auth";
import { useChildren } from "../../../src/services/parentData";
import { colors, radius } from "../../../src/theme/tokens";

const logo = require("../../../assets/images/acadex-logo.png");
const graduationCap = require("../../../assets/images/3d/graduation-cap.webp");
const bookStack = require("../../../assets/images/3d/book-stack.webp");
const schoolBag = require("../../../assets/images/3d/school-bag.webp");
const calendar3d = require("../../../assets/images/3d/calendar.webp");
const book3d = require("../../../assets/images/3d/book.webp");
const money3d = require("../../../assets/images/3d/money.webp");
const bell3d = require("../../../assets/images/3d/bell.webp");
const megaphone3d = require("../../../assets/images/3d/megaphone.webp");
const school3d = require("../../../assets/images/3d/school.webp");

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
  const unread =
    notifications.data?.filter((item) => !item.read_at).length ?? 0;
  const presentCount = attendance.data?.counts.present ?? 0;
  const recordedCount = attendance.data?.total_recorded ?? 0;
  const formattedPaid = fees.data
    ? Number(fees.data.paid_total).toLocaleString()
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
      <Animated.View
        entering={FadeInDown.duration(340)}
        style={[styles.topbar, { paddingTop: insets.top + 4 }]}
      >
        <Image source={logo} resizeMode="contain" style={styles.logo} />
        <View style={styles.topbarRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${unread} unread updates`}
            onPress={() => router.push("/(parent)/(tabs)/notifications")}
            style={styles.bellButton}
          >
            <Bell color={colors.ink} size={23} strokeWidth={1.8} />
            {unread > 0 ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {unread > 9 ? "9+" : unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            onPress={() => router.push("/(parent)/(tabs)/profile")}
            style={styles.parentAvatar}
          >
            <Text style={styles.parentAvatarText}>
              {initials(parent?.display_name)}
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInUp.duration(360)} style={styles.welcome}>
        <View style={styles.heroCopy}>
          <Text style={styles.greeting}>Good {dayGreeting()},</Text>
          <Text style={styles.parentName} numberOfLines={1}>
            {parent?.display_name.split(" ")[0] ?? "there"} 👋
          </Text>
          <Text style={styles.caption}>
            Here’s an overview of your child’s progress.
          </Text>
        </View>
        <View pointerEvents="none" style={styles.heroArt}>
          <View style={styles.heroHalo} />
          <Image
            source={bookStack}
            resizeMode="contain"
            style={styles.heroBooks}
          />
          <Image
            source={graduationCap}
            resizeMode="contain"
            style={styles.heroCap}
          />
        </View>
      </Animated.View>

      {children.length ? (
        <Animated.View entering={FadeInUp.delay(110).duration(340)}>
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
                <View
                  style={[
                    styles.childAvatar,
                    active && styles.childAvatarActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.childInitials,
                      active && styles.childInitialsActive,
                    ]}
                  >
                    {initials(`${child.first_name} ${child.last_name}`)}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={styles.childName} numberOfLines={1}>
                    {child.first_name} {child.last_name}
                  </Text>
                  <Text style={styles.childAdmission} numberOfLines={1}>
                    {child.admission_number}
                  </Text>
                </View>
                {active ? (
                  <View style={styles.selectedCheck}>
                    <Check color="#fff" size={14} strokeWidth={3} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
        </Animated.View>
      ) : null}

      {selectedChild ? (
        <>
          <Animated.View entering={FadeInUp.delay(190).duration(360)}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${selectedChild.first_name}'s profile`}
              onPress={() => router.push("/(parent)/(tabs)/children")}
              style={({ pressed }) => [
                styles.studentBanner,
                pressed && styles.pressed,
              ]}
            >
              <LinearGradient
                colors={["#2A7BF6", "#1CA5E7"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View pointerEvents="none" style={styles.bannerGlow} />
              <View pointerEvents="none" style={styles.bannerGlowTwo} />
              <View pointerEvents="none" style={styles.bannerRing} />
              <View style={styles.bannerCopy}>
                <Text style={styles.bannerName} numberOfLines={1}>
                  {selectedChild.first_name} {selectedChild.last_name}
                </Text>
                <Text style={styles.bannerDetail} numberOfLines={1}>
                  Class: {selectedChild.class_name || "Not assigned"}
                </Text>
                <Text style={styles.bannerDetail} numberOfLines={1}>
                  Admission No: {selectedChild.admission_number}
                </Text>
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Active student</Text>
                </View>
              </View>
              <Image
                source={schoolBag}
                resizeMode="contain"
                style={styles.bagArt}
              />
            </Pressable>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(260).duration(340)}
            style={styles.metricsRow}
          >
            <MetricCard
              icon={calendar3d}
              tint="#EAF3FF"
              title="Attendance"
              value={
                attendance.isLoading
                  ? "…"
                  : recordedCount
                    ? `${presentCount}/${recordedCount}`
                    : "—"
              }
              detail="Present"
              detailColor="#169B69"
              footer={<ChevronUp size={12} color="#169B69" strokeWidth={2.5} />}
              onPress={() => router.push("/(parent)/attendance")}
            />
            <MetricCard
              icon={book3d}
              tint="#F3ECFF"
              title="Average grade"
              value={reports.isLoading ? "…" : averageGrade}
              detail={term?.term_name ?? "Latest report"}
              detailColor="#8053D6"
              footer={<ChevronRight size={12} color="#8053D6" strokeWidth={2.5} />}
              onPress={() => router.push("/(parent)/(tabs)/academics")}
            />
            <MetricCard
              icon={money3d}
              tint="#E9F8EF"
              title="Fees paid"
              value={fees.isLoading ? "…" : formattedPaid}
              detail="All recorded"
              detailColor="#169B69"
              footer={<Check size={12} color="#169B69" strokeWidth={3} />}
              onPress={() => router.push("/(parent)/fees")}
            />
            <MetricCard
              icon={calendar3d}
              tint="#FFF2E2"
              title="Upcoming"
              value={events.isLoading ? "…" : String(events.data?.length ?? 0)}
              detail="School events"
              detailColor="#C86816"
              footer={<ChevronRight size={12} color="#C86816" strokeWidth={2.5} />}
              onPress={() => router.push("/(parent)/timetable")}
            />
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(320).duration(320)}
            style={styles.sectionHeading}
          >
            <View style={styles.sectionLabel}>
              <Image
                source={calendar3d}
                resizeMode="contain"
                style={styles.sectionIcon}
              />
              <Text style={styles.sectionTitle}>Recent attendance</Text>
            </View>
            <Pressable
              onPress={() => router.push("/(parent)/attendance")}
              hitSlop={8}
            >
              <ViewAllLabel />
            </Pressable>
          </Animated.View>
          <Animated.View
            entering={FadeInUp.delay(360).duration(320)}
            style={styles.attendanceCard}
          >
            {attendance.isLoading ? (
              <LoadingState />
            ) : attendance.error ? (
              <Text style={styles.mutedText}>
                Attendance is unavailable right now.
              </Text>
            ) : attendance.data?.records.length ? (
              <View style={styles.weekStrip}>
                {attendance.data.records.slice(0, 5).map((record, index) => {
                  const date = new Date(`${record.date}T00:00:00`);
                  return (
                    <View
                      key={`${record.date}-${record.status}`}
                      style={[styles.dayItem, index > 0 && styles.dayDivider]}
                    >
                      <Text style={styles.dayName}>
                        {date.toLocaleDateString(undefined, {
                          weekday: "short",
                        })}
                      </Text>
                      <Text style={styles.dayNumber}>
                        {date.toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
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
                          <Check color="#fff" size={14} strokeWidth={3} />
                        ) : record.status === "late" ? (
                          <Text style={styles.markText}>–</Text>
                        ) : (
                          <X size={12} color="#7183A4" strokeWidth={3} />
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.mutedText}>No attendance records yet.</Text>
            )}
          </Animated.View>

          <Animated.View entering={FadeInUp.delay(410).duration(320)}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(parent)/announcements")}
            style={({ pressed }) => [
              styles.announcementCard,
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={megaphone3d}
              resizeMode="contain"
              style={styles.announcementArt}
            />
            <View style={styles.announcementInfo}>
              <Text style={styles.announcementEyebrow}>
                Latest announcement
              </Text>
              {announcements.isLoading ? (
                <Text style={styles.announcementTitle}>Loading updates…</Text>
              ) : announcements.error ? (
                <Text style={styles.announcementBody} numberOfLines={2}>
                  {apiErrorMessage(announcements.error)}
                </Text>
              ) : latestAnnouncement ? (
                <>
                  <View style={styles.announcementTitleRow}>
                    <Text style={styles.announcementTitle} numberOfLines={1}>
                      {latestAnnouncement.title}
                    </Text>
                    <Text style={styles.newPill}>New</Text>
                  </View>
                  <Text style={styles.announcementBody} numberOfLines={2}>
                    {latestAnnouncement.body}
                  </Text>
                  <Text style={styles.announcementDate}>
                    {new Date(
                      latestAnnouncement.published_at,
                    ).toLocaleDateString()}
                  </Text>
                </>
              ) : (
                <Text style={styles.announcementBody} numberOfLines={2}>
                  School announcements will appear here.
                </Text>
              )}
            </View>
            <ChevronRight color={colors.blue} size={21} />
          </Pressable>
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(460).duration(320)}
            style={styles.sectionHeading}
          >
            <View style={styles.sectionLabel}>
              <Zap color={colors.blue} size={21} fill={colors.blue} />
              <Text style={styles.sectionTitle}>Quick actions</Text>
            </View>
            <Pressable
              onPress={() => router.push("/(parent)/(tabs)/children")}
              hitSlop={8}
            >
              <ViewAllLabel />
            </Pressable>
          </Animated.View>
          <Animated.View
            entering={FadeInUp.delay(500).duration(340)}
            style={styles.quickGrid}
          >
            <QuickAction
              delay={0}
              icon={book3d}
              tint="#EAF3FF"
              title="View grades"
              onPress={() => router.push("/(parent)/(tabs)/academics")}
            />
            <QuickAction
              delay={70}
              icon={money3d}
              tint="#F3ECFF"
              title="Fees"
              onPress={() => router.push("/(parent)/fees")}
            />
            <QuickAction
              delay={140}
              icon={calendar3d}
              tint="#E9F8EF"
              title="Attendance"
              onPress={() => router.push("/(parent)/attendance")}
            />
            <QuickAction
              delay={210}
              icon={bell3d}
              tint="#FFF2E2"
              title="Updates"
              onPress={() => router.push("/(parent)/(tabs)/notifications")}
            />
          </Animated.View>

          <Animated.View
            entering={FadeInUp.delay(560).duration(340)}
            style={styles.welcomeBanner}
          >
            <View style={styles.welcomeIcon}>
              <Image
                source={graduationCap}
                resizeMode="contain"
                style={styles.welcomeCap}
              />
            </View>
            <View style={styles.welcomeBannerCopy}>
              <Text style={styles.welcomeTitle}>Welcome to Acadex Connect</Text>
              <Text style={styles.welcomeBody}>
                Stay connected with your child’s academic journey.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(parent)/(tabs)/children")}
              style={styles.learnButton}
            >
              <Text style={styles.learnText}>Explore</Text>
              <ArrowRight size={15} color={colors.blue} />
            </Pressable>
            <Image
              source={school3d}
              resizeMode="contain"
              style={styles.schoolArt}
            />
          </Animated.View>
        </>
      ) : children.length === 0 ? (
        <EmptyState
          title="No linked children yet"
          body="Your school has not linked a child to this account. Contact the school office to request a verified link."
        />
      ) : (
        <LoadingState />
      )}
    </Screen>
  );
}

function MetricCard({
  icon,
  tint,
  title,
  value,
  detail,
  detailColor,
  footer,
  onPress,
}: {
  icon: number;
  tint: string;
  title: string;
  value: string;
  detail: string;
  detailColor: string;
  footer?: ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.metricCard,
        { backgroundColor: tint },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.metricIcon}>
        <Image source={icon} resizeMode="contain" style={styles.metricImage} />
      </View>
      <Text style={styles.metricTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <View style={styles.metricFooter}>
        <Text
          style={[styles.metricDetail, { color: detailColor }]}
          numberOfLines={1}
        >
          {detail}
        </Text>
        {footer}
      </View>
    </Pressable>
  );
}

function QuickAction({
  icon,
  tint,
  title,
  onPress,
  delay,
}: {
  icon: number;
  tint: string;
  title: string;
  onPress: () => void;
  delay: number;
}) {
  return (
    <Animated.View
      entering={FadeInUp.delay(delay).duration(300)}
      style={styles.quickCell}
    >
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
      >
        <View style={[styles.quickIcon, { backgroundColor: tint }]}>
          <Image source={icon} resizeMode="contain" style={styles.quickImage} />
        </View>
        <View style={styles.quickBottom}>
          <Text style={styles.quickTitle} numberOfLines={1}>
            {title}
          </Text>
          <ChevronRight color={colors.muted} size={16} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ViewAllLabel() {
  return (
    <View style={styles.viewAll}>
      <Text style={styles.viewAllText}>View all</Text>
      <ChevronRight size={15} color={colors.blue} />
    </View>
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
  screen: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 24,
    gap: 12,
  },
  topbar: {
    minHeight: 52,
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logo: { width: 132, height: 41 },
  topbarRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
  },
  bellButton: {
    width: 36,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: "#F04444",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  unreadText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  parentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 22,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  parentAvatarText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  welcome: {
    minHeight: 142,
    position: "relative",
    justifyContent: "center",
    overflow: "hidden",
    marginHorizontal: -16,
    paddingHorizontal: 20,
    backgroundColor: "#F1F7FF",
  },
  heroCopy: { width: "68%", zIndex: 2, gap: 1 },
  greeting: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  parentName: {
    color: colors.ink,
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  caption: {
    maxWidth: 260,
    color: "#6283BD",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5,
  },
  heroArt: {
    position: "absolute",
    right: 8,
    bottom: 0,
    width: 160,
    height: 130,
    alignItems: "center",
    justifyContent: "center",
  },
  heroHalo: {
    position: "absolute",
    width: 116,
    height: 116,
    right: 18,
    top: 4,
    borderRadius: 70,
    backgroundColor: "#DCEBFF",
  },
  heroBooks: {
    position: "absolute",
    width: 143,
    height: 98,
    right: 4,
    bottom: 1,
  },
  heroCap: { position: "absolute", width: 80, height: 80, right: 51, top: -1 },
  childPickerRow: { gap: 8, paddingRight: 16 },
  childCard: {
    width: 194,
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  childCardActive: {
    borderWidth: 1.7,
    borderColor: colors.blue,
    backgroundColor: "#F8FBFF",
  },
  childAvatar: {
    width: 42,
    height: 42,
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  childAvatarActive: { backgroundColor: colors.blue },
  childInitials: { color: colors.blue, fontSize: 12, fontWeight: "800" },
  childInitialsActive: { color: "#fff" },
  childInfo: { flex: 1, minWidth: 0, gap: 4 },
  childName: { color: colors.ink, fontSize: 11, fontWeight: "800" },
  childAdmission: { color: colors.muted, fontSize: 9 },
  selectedCheck: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  studentBanner: {
    minHeight: 136,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 20,
    backgroundColor: "#2A7BF6",
  },
  bannerGlow: {
    position: "absolute",
    top: -34,
    right: 34,
    width: 172,
    height: 172,
    borderRadius: 96,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  bannerGlowTwo: {
    position: "absolute",
    bottom: -46,
    left: -30,
    width: 132,
    height: 132,
    borderRadius: 72,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  bannerRing: {
    position: "absolute",
    top: 12,
    right: -42,
    width: 148,
    height: 148,
    borderRadius: 80,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
  },
  bannerCopy: { zIndex: 1, flex: 1, gap: 4 },
  bannerName: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 1,
  },
  bannerDetail: { color: "#EFF6FF", fontSize: 12, lineHeight: 18 },
  activePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: "#E7F8F0",
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#139D6B",
  },
  activeText: {
    color: "#16815D",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  bagArt: {
    position: "absolute",
    width: 148,
    height: 126,
    right: 5,
    bottom: 0,
  },
  metricsRow: { flexDirection: "row", gap: 8 },
  metricCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 134,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(49,93,245,0.08)",
    borderRadius: 18,
  },
  metricIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    marginBottom: 8,
  },
  metricImage: { width: 36, height: 36 },
  metricTitle: {
    color: "#41537A",
    fontSize: 9.5,
    fontWeight: "700",
    marginTop: 2,
  },
  metricValue: {
    color: colors.blueDeep,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
    maxWidth: "100%",
    letterSpacing: -0.4,
  },
  metricDetail: { fontSize: 9, fontWeight: "700" },
  metricFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
    marginTop: "auto",
    paddingTop: 6,
    gap: 3,
  },
  sectionHeading: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 1,
  },
  sectionLabel: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionIcon: { width: 28, height: 28 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  viewAll: { flexDirection: "row", alignItems: "center", gap: 1 },
  viewAllText: { color: colors.blue, fontSize: 11, fontWeight: "700" },
  attendanceCard: {
    minHeight: 109,
    justifyContent: "center",
    padding: 10,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  weekStrip: { flexDirection: "row", justifyContent: "space-between" },
  dayItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    minHeight: 76,
  },
  dayDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  dayName: { color: colors.muted, fontSize: 10 },
  dayNumber: { color: colors.ink, fontSize: 11, fontWeight: "700" },
  attendanceMark: {
    width: 23,
    height: 23,
    borderRadius: 12,
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  attendancePresent: { backgroundColor: "#31BC7B" },
  attendanceLate: { backgroundColor: "#FFF0D8" },
  attendanceAbsent: { backgroundColor: "#E7EEF8" },
  markText: { color: "#7183A4", fontWeight: "800", fontSize: 12 },
  mutedText: { color: colors.muted, fontSize: 11, lineHeight: 17 },
  announcementCard: {
    minHeight: 103,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    overflow: "hidden",
    padding: 11,
    borderRadius: 18,
    backgroundColor: "#EAF3FF",
    borderWidth: 1,
    borderColor: "#D4E5FF",
  },
  announcementArt: { width: 63, height: 68 },
  announcementInfo: { flex: 1, minWidth: 0, gap: 4 },
  announcementEyebrow: { color: "#3D77D7", fontSize: 10, fontWeight: "600" },
  announcementTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  announcementTitle: {
    color: colors.blueDeep,
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  newPill: {
    color: colors.blue,
    backgroundColor: "#D7E8FF",
    borderRadius: 9,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 9,
    fontWeight: "700",
    overflow: "hidden",
  },
  announcementBody: { color: colors.muted, fontSize: 10, lineHeight: 15 },
  announcementDate: { color: "#6283BD", fontSize: 9, marginTop: 1 },
  quickBolt: {
    color: colors.blue,
    fontSize: 26,
    lineHeight: 28,
    fontWeight: "900",
  },
  quickGrid: { flexDirection: "row", gap: 7 },
  quickCell: { flex: 1, minWidth: 0 },
  quickAction: {
    minHeight: 85,
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: 9,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  quickImage: { width: 37, height: 37 },
  quickBottom: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  quickTitle: { color: colors.ink, flex: 1, fontSize: 10, fontWeight: "700" },
  welcomeBanner: {
    minHeight: 78,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 17,
    backgroundColor: "#2678F6",
  },
  welcomeIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  welcomeCap: { width: 34, height: 34 },
  welcomeBannerCopy: { flex: 1, zIndex: 1, gap: 3 },
  welcomeTitle: { color: "#fff", fontSize: 12, fontWeight: "800" },
  welcomeBody: { color: "#E7F1FF", fontSize: 9, lineHeight: 14 },
  learnButton: {
    zIndex: 2,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: "#fff",
  },
  learnText: { color: colors.blue, fontSize: 9, fontWeight: "800" },
  schoolArt: {
    position: "absolute",
    width: 96,
    height: 64,
    right: -6,
    bottom: -12,
    opacity: 0.95,
  },
  pressed: { opacity: 0.78 },
});
