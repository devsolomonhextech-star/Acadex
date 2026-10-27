import { useRouter } from "expo-router";
import {
  ArrowUpRight,
  CalendarCheck,
  CreditCard,
  GraduationCap,
  NotebookTabs,
} from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChildPicker } from "../../../src/components/ChildPicker";
import { Card, Heading, Screen } from "../../../src/components/ui";
import { useChildren } from "../../../src/services/parentData";
import { colors, radius } from "../../../src/theme/tokens";

export default function ChildrenScreen() {
  const router = useRouter();
  const { children, selectedChild } = useChildren();
  const links = [
    {
      title: "Academics & reports",
      icon: <GraduationCap color={colors.blue} size={19} />,
      route: "/(parent)/(tabs)/academics" as const,
    },
    {
      title: "Attendance",
      icon: <CalendarCheck color={colors.blue} size={19} />,
      route: "/(parent)/attendance" as const,
    },
    {
      title: "Fees & receipts",
      icon: <CreditCard color={colors.blue} size={19} />,
      route: "/(parent)/fees" as const,
    },
    {
      title: "Class timetable",
      icon: <NotebookTabs color={colors.blue} size={19} />,
      route: "/(parent)/timetable" as const,
    },
  ];
  return (
    <Screen>
      <Heading
        title="My children"
        subtitle={`${children.length} linked ${children.length === 1 ? "child" : "children"}`}
      />
      <ChildPicker />
      {selectedChild ? (
        <Card style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>
              {selectedChild.first_name[0]}
              {selectedChild.last_name[0]}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {selectedChild.first_name} {selectedChild.last_name}
            </Text>
            <Text style={styles.meta}>
              {selectedChild.class_name || "Class information unavailable"}
            </Text>
            <Text style={styles.meta}>
              Admission no. {selectedChild.admission_number}
            </Text>
          </View>
        </Card>
      ) : null}
      <Text style={styles.label}>CHILD INFORMATION</Text>
      {links.map((item) => (
        <Pressable
          key={item.title}
          onPress={() => router.push(item.route)}
          accessibilityRole="button"
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}
        >
          <View style={styles.icon}>{item.icon}</View>
          <Text style={styles.linkTitle}>{item.title}</Text>
          <ArrowUpRight size={16} color={colors.mutedLight} />
        </Pressable>
      ))}
      <Card style={styles.help}>
        <Text style={styles.helpTitle}>Need to link another child?</Text>
        <Text style={styles.helpBody}>
          For your family’s privacy, only the school can verify and link
          children to your account. Contact the school office for assistance.
        </Text>
      </Card>
    </Screen>
  );
}
const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  initials: { color: colors.blue, fontSize: 17, fontWeight: "800" },
  name: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  label: {
    color: colors.mutedLight,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    marginTop: 8,
  },
  link: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  linkTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", flex: 1 },
  help: { backgroundColor: "#F0F6FF", borderColor: "#D6E5FF" },
  helpTitle: { color: colors.blueDeep, fontSize: 14, fontWeight: "700" },
  helpBody: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
