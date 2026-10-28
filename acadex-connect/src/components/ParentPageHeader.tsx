import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { communicationsApi } from "../features/communicationsApi";
import { colors } from "../theme/tokens";

export function ParentPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const router = useRouter();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => communicationsApi.notifications(signal),
  });
  const unread = notifications.data?.some((item) => !item.read_at) ?? false;

  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open school updates"
        onPress={() => router.push("/(parent)/(tabs)/notifications")}
        style={({ pressed }) => [styles.bell, pressed && { opacity: 0.7 }]}
      >
        <Bell size={22} color={colors.muted} strokeWidth={1.8} />
        {unread ? <View style={styles.dot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  copy: { flex: 1 },
  title: {
    color: colors.ink,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  bell: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    position: "absolute",
    right: 8,
    top: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
});
