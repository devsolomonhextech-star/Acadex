import { Pressable, StyleSheet, Text, View } from "react-native";
import { LogOut, Mail, ShieldCheck } from "lucide-react-native";
import { useAuth } from "../../../src/services/auth";
import { Card, Heading, Screen } from "../../../src/components/ui";
import { colors, radius } from "../../../src/theme/tokens";

export default function ProfileScreen() {
  const { parent, signOut } = useAuth();
  const initials =
    parent?.display_name
      .split(" ")
      .map((value) => value[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "P";
  return (
    <Screen>
      <Heading
        title="Your profile"
        subtitle="Your family account and school connection."
      />
      <Card style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{parent?.display_name}</Text>
          <Text style={styles.school}>{parent?.school_name}</Text>
        </View>
      </Card>
      <Card>
        <View style={styles.line}>
          <Mail size={17} color={colors.blue} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value}>{parent?.email}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <View style={styles.line}>
          <ShieldCheck size={17} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>School workspace</Text>
            <Text style={styles.value}>{parent?.school_slug}</Text>
          </View>
        </View>
      </Card>
      <Card style={styles.note}>
        <Text style={styles.noteTitle}>Keep your account secure</Text>
        <Text style={styles.noteBody}>
          Your school verifies linked children and manages the contact details
          shown here. Contact the school office if your details need updating.
        </Text>
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut()}
        style={styles.logout}
      >
        <LogOut size={18} color={colors.danger} />
        <Text style={styles.logoutText}>Sign out</Text>
      </Pressable>
      <Text style={styles.version}>Acadex Connect · Parent access</Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: "#fff", fontSize: 17, fontWeight: "800" },
  name: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  school: { color: colors.muted, fontSize: 12, marginTop: 4 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 5,
  },
  label: { color: colors.mutedLight, fontSize: 11 },
  value: { color: colors.ink, fontSize: 14, fontWeight: "600", marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  note: { backgroundColor: colors.infoSoft, borderColor: "#D2E9F6" },
  noteTitle: { color: colors.blueDeep, fontSize: 14, fontWeight: "700" },
  noteBody: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  logout: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderColor: "#F4C9C6",
    borderWidth: 1,
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
  },
  logoutText: { color: colors.danger, fontWeight: "700" },
  version: { textAlign: "center", fontSize: 11, color: colors.mutedLight },
});
