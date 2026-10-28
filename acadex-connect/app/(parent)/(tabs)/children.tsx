import { useRouter } from "expo-router";
import {
  CalendarCheck,
  ChevronRight,
  CreditCard,
  GraduationCap,
  NotebookTabs,
  UsersRound,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { ChildPicker } from "../../../src/components/ChildPicker";
import { ParentPageHeader } from "../../../src/components/ParentPageHeader";
import { Card, Screen } from "../../../src/components/ui";
import { useChildren } from "../../../src/services/parentData";
import { colors, radius } from "../../../src/theme/tokens";

export default function ChildrenScreen() {
  const router = useRouter();
  const { children, selectedChild } = useChildren();
  const links = [
    {
      title: "Academics & reports",
      icon: GraduationCap,
      route: "/(parent)/(tabs)/academics" as const,
    },
    {
      title: "Attendance",
      icon: CalendarCheck,
      route: "/(parent)/attendance" as const,
    },
    {
      title: "Fees & receipts",
      icon: CreditCard,
      route: "/(parent)/fees" as const,
    },
    {
      title: "Class timetable",
      icon: NotebookTabs,
      route: "/(parent)/timetable" as const,
    },
  ];

  return (
    <Screen contentStyle={styles.screen}>
      <ParentPageHeader
        title="My Children"
        subtitle={`${children.length} linked ${children.length === 1 ? "child" : "children"}`}
      />
      <ChildPicker />

      {selectedChild ? (
        <Animated.View entering={FadeInUp.duration(280)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${selectedChild.first_name} ${selectedChild.last_name}`}
            onPress={() => router.push("/(parent)/(tabs)/academics")}
          >
            <Card style={styles.studentCard}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentInitials}>
                  {initials(selectedChild.first_name, selectedChild.last_name)}
                </Text>
              </View>
              <View style={styles.studentCopy}>
                <Text style={styles.studentName} numberOfLines={1}>
                  {selectedChild.first_name} {selectedChild.last_name}
                </Text>
                <Text style={styles.admission}>
                  {selectedChild.admission_number}
                </Text>
                <Text style={styles.classPill}>
                  {selectedChild.class_name || "Class not assigned"}
                </Text>
              </View>
              <ChevronRight size={21} color={colors.muted} />
            </Card>
          </Pressable>
        </Animated.View>
      ) : null}

      <Text style={styles.sectionTitle}>Quick access</Text>
      <View style={styles.quickGrid}>
        {links.map(({ title, icon: Icon, route }, index) => (
          <Animated.View
            key={title}
            entering={FadeInUp.delay(index * 45).duration(260)}
            style={styles.quickCell}
          >
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(route)}
              style={({ pressed }) => [
                styles.quickCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.quickIcon}>
                <Icon size={22} color={colors.blue} strokeWidth={2} />
              </View>
              <View style={styles.quickBottom}>
                <Text style={styles.quickTitle}>{title}</Text>
                <ChevronRight size={18} color={colors.muted} />
              </View>
            </Pressable>
          </Animated.View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(parent)/(tabs)/profile")}
        style={({ pressed }) => [styles.familyPanel, pressed && styles.pressed]}
      >
        <View style={styles.familyIcon}>
          <UsersRound size={21} color={colors.blue} />
        </View>
        <View style={styles.familyCopy}>
          <Text style={styles.familyTitle}>Family access</Text>
          <Text style={styles.familyBody}>
            Need to link another child? Contact the school office to verify your
            account.
          </Text>
        </View>
        <ChevronRight size={20} color={colors.muted} />
      </Pressable>
    </Screen>
  );
}

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 12, gap: 16, paddingBottom: 30 },
  studentCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    padding: 15,
    borderRadius: 18,
  },
  studentAvatar: {
    width: 58,
    height: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  studentInitials: { color: "#fff", fontSize: 17, fontWeight: "800" },
  studentCopy: { flex: 1, minWidth: 0, gap: 4 },
  studentName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  admission: { color: colors.muted, fontSize: 12 },
  classPill: {
    alignSelf: "flex-start",
    overflow: "hidden",
    marginTop: 2,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    color: colors.blueDeep,
    backgroundColor: colors.blueSoft,
    fontSize: 11,
    fontWeight: "600",
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 1,
  },
  quickGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 },
  quickCell: { width: "50%", paddingHorizontal: 5, paddingBottom: 10 },
  quickCard: {
    minHeight: 112,
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  quickBottom: { flexDirection: "row", alignItems: "center", gap: 5 },
  quickTitle: {
    flex: 1,
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  familyPanel: {
    minHeight: 88,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D2E1FF",
    backgroundColor: "#F0F6FF",
  },
  familyIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C9DAFF",
    alignItems: "center",
    justifyContent: "center",
  },
  familyCopy: { flex: 1, gap: 4 },
  familyTitle: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  familyBody: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.74 },
});
