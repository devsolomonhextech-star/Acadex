import { useRouter } from "expo-router";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  Globe2,
  LogOut,
  Mail,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react-native";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Card, Screen } from "../../../src/components/ui";
import { useAuth } from "../../../src/services/auth";
import { colors, radius } from "../../../src/theme/tokens";

export default function ProfileScreen() {
  const router = useRouter();
  const { parent, signOut } = useAuth();
  const initials =
    parent?.display_name
      .split(" ")
      .map((value) => value[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "P";

  const settings = [
    {
      title: "Personal information",
      icon: UserRound,
      action: () =>
        Alert.alert(
          "Personal information",
          "Your school manages verified parent contact details. Please contact the school office if anything needs to be updated.",
        ),
    },
    {
      title: "School updates",
      icon: Bell,
      action: () => router.push("/(parent)/(tabs)/notifications"),
    },
    {
      title: "Privacy & security",
      icon: ShieldCheck,
      action: () =>
        Alert.alert(
          "Privacy & security",
          "Your account only shows children linked and verified by your school. Keep your sign-in details private and contact the school if you notice anything unexpected.",
        ),
    },
    {
      title: "Language",
      icon: Globe2,
      detail: "English",
      action: () =>
        Alert.alert(
          "Language",
          "Acadex Connect is currently shown in English.",
        ),
    },
    {
      title: "Help & support",
      icon: CircleHelp,
      action: () =>
        Alert.alert(
          "Need help?",
          "Contact your school office for assistance with your account, linked children, payments or published reports.",
        ),
    },
  ];

  return (
    <Screen contentStyle={styles.screen} safeAreaTop>
      <Animated.View entering={FadeInUp.duration(300)} style={styles.identity}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        </View>
        <Text style={styles.name}>{parent?.display_name}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.role}>Parent account</Text>
        </View>
      </Animated.View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Contact information</Text>
        <Text style={styles.managed}>School managed</Text>
      </View>
      <Card style={styles.contactCard}>
        <InfoRow
          icon={Mail}
          label="Email address"
          value={parent?.email ?? "Not available"}
        />
        <View style={styles.divider} />
        <InfoRow
          icon={UsersRound}
          label="School"
          value={parent?.school_name ?? "Your school"}
        />
        <View style={styles.divider} />
        <InfoRow
          icon={ShieldCheck}
          label="School workspace"
          value={parent?.school_slug ?? "Connected"}
        />
      </Card>

      <Text style={styles.sectionTitle}>Account settings</Text>
      <Card style={styles.settingsCard}>
        {settings.map(({ title, icon: Icon, action, detail }, index) => (
          <View key={title} style={styles.rowWrapper}>
            {index > 0 ? <View style={styles.rowDivider} /> : null}
            <Pressable
              accessibilityRole="button"
              onPress={action}
              style={({ pressed }) => [
                styles.settingRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.infoIcon}>
                <Icon size={18} color={colors.blue} strokeWidth={2} />
              </View>
              <Text style={styles.settingTitle}>{title}</Text>
              {detail ? (
                <Text style={styles.settingDetail}>{detail}</Text>
              ) : null}
            </Pressable>
          </View>
        ))}
      </Card>

      <Pressable
        accessibilityRole="button"
        onPress={() =>
          Alert.alert(
            "Sign out?",
            "You can sign in again with your parent account.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Sign out",
                style: "destructive",
                onPress: () => void signOut(),
              },
            ],
          )
        }
        style={({ pressed }) => [styles.logoutCard, pressed && styles.pressed]}
      >
        <View style={styles.logoutIconWrap}>
          <LogOut size={18} color={colors.danger} strokeWidth={2} />
        </View>
        <Text style={styles.logoutText}>Sign out</Text>
        <ChevronRight size={19} color={colors.danger} strokeWidth={2} />
      </Pressable>
      <Text style={styles.version}>Acadex Connect · Parent access</Text>
    </Screen>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={18} color={colors.blue} strokeWidth={2} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingTop: 20, gap: 16, paddingBottom: 32 },
  identity: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  name: {
    color: colors.ink,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "800",
    textAlign: "center",
  },
  rolePill: {
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
  },
  role: { color: colors.blue, fontSize: 12, fontWeight: "600" },

  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  managed: { color: colors.muted, fontSize: 11, fontWeight: "500" },

  // Contact card
  contactCard: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 19,
    alignItems: "stretch",
  },
  infoRow: {
    minHeight: 61,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, minWidth: 0, gap: 3 },
  infoLabel: { color: colors.muted, fontSize: 11 },
  infoValue: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: 48 },

  // Settings card
  settingsCard: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderRadius: 19,
    alignItems: "stretch", // Forces children to fill card width
  },
  rowWrapper: {
    width: "100%", // CRITICAL FIX: Forces row to expand
  },
  settingRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
  },
  settingTitle: {
    flex: 1, // Pushes the chevron to the right edge
    color: colors.ink,
    fontSize: 14,
    fontWeight: "600",
  },
  settingDetail: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "500",
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 34,
  },

  // Sign out
  logoutCard: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#FFD2D1",
    borderRadius: 16,
    backgroundColor: "#FFF8F8",
    marginTop: 4,
  },
  logoutIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: "#FFE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutText: {
    flex: 1,
    color: colors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
  version: {
    textAlign: "center",
    fontSize: 11,
    color: colors.mutedLight,
    marginTop: 2,
  },
  pressed: { opacity: 0.7 },
});
