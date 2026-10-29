import { useState, type ReactNode } from "react";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronRight,
  CircleHelp,
  Globe2,
  LockKeyhole,
  LogOut,
  Mail,
  ShieldCheck,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaymentLogo } from "../../../src/components/payments/PaymentLogo";
import { PaymentMethodsSheet } from "../../../src/components/payments/PaymentMethodsSheet";
import {
  FloatingOrb,
  PressableScale,
} from "../../../src/components/insights/InsightVisuals";
import {
  PAYMENT_METHODS,
  paymentMethodById,
  type PaymentMethodId,
} from "../../../src/features/payments";
import { useAuth } from "../../../src/services/auth";
import { useChildren } from "../../../src/services/parentData";
import { colors } from "../../../src/theme/tokens";

const PAGE = "#F4F8FD";

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { parent, signOut } = useAuth();
  const { children, isLoading: childrenLoading } = useChildren();
  const [defaultMethod, setDefaultMethod] = useState<PaymentMethodId | null>(
    "mtn",
  );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSelection, setSheetSelection] = useState<PaymentMethodId>("mtn");

  const displayName = parent?.display_name ?? "Parent";
  const email = parent?.email ?? "Not available";
  const school = parent?.school_name ?? "Your school";
  const workspace = parent?.school_slug ?? "Connected";
  const selectedPayment = defaultMethod
    ? paymentMethodById(defaultMethod)
    : null;
  const childCount = childrenLoading ? "—" : String(children.length);

  const showHelp = () => {
    Alert.alert(
      "Need help?",
      `Contact ${school} for help with your account, linked children, payments or published reports.`,
      [{ text: "Got it" }],
    );
  };

  const openPaymentSheet = (method?: PaymentMethodId) => {
    setSheetSelection(method ?? defaultMethod ?? "mtn");
    setSheetOpen(true);
  };

  const savePaymentMethod = (method: PaymentMethodId) => {
    setDefaultMethod(method);
    setSheetOpen(false);
  };

  const confirmSignOut = () => {
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
    );
  };

  const settings: {
    title: string;
    subtitle: string;
    icon: LucideIcon;
    action: () => void;
    detail?: string;
  }[] = [
    {
      title: "Notifications",
      subtitle: "School updates and reminders",
      icon: Bell,
      action: () => router.push("/(parent)/(tabs)/notifications"),
    },
    {
      title: "Privacy & security",
      subtitle: "How your child’s data is protected",
      icon: ShieldCheck,
      action: () =>
        Alert.alert(
          "Privacy & security",
          "Your account only shows children linked and verified by your school. Keep your sign-in details private and contact the school if you notice anything unexpected.",
        ),
    },
    {
      title: "Language",
      subtitle: "App language",
      detail: "English",
      icon: Globe2,
      action: () =>
        Alert.alert(
          "Language",
          "Acadex Connect is currently shown in English.",
        ),
    },
    {
      title: "Help & support",
      subtitle: "Contact your school office",
      icon: CircleHelp,
      action: showHelp,
    },
  ];

  return (
    <View style={styles.screen}>
      <Animated.View
        entering={FadeInDown.duration(300)}
        style={[styles.header, { paddingTop: insets.top + 6 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ACCOUNT</Text>
            <Text style={styles.title}>Profile</Text>
          </View>
          <PressableScale
            accessibilityLabel="Account help"
            onPress={showHelp}
            style={styles.headerHelp}
          >
            <CircleHelp size={19} color={colors.blue} strokeWidth={2.1} />
          </PressableScale>
        </View>
        <Text style={styles.subtitle}>
          Manage your account, security and payment preferences.
        </Text>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <Animated.View entering={FadeInDown.delay(40).duration(400)}>
          <View style={styles.identity}>
            <LinearGradient
              colors={["#0A2E7A", "#155EEF", "#3B96FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <FloatingOrb
              style={styles.identityOrbLarge}
              distance={9}
              duration={5600}
            />
            <FloatingOrb
              style={styles.identityOrbSmall}
              distance={-7}
              duration={4800}
            />
            <View style={styles.identityTop}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                  <Text style={styles.initials}>
                    {initialsFor(displayName)}
                  </Text>
                </View>
                <Animated.View
                  entering={ZoomIn.delay(260).duration(280)}
                  style={styles.avatarCheck}
                >
                  <Check size={10} color="#FFFFFF" strokeWidth={3.4} />
                </Animated.View>
              </View>
              <View style={styles.identityCopy}>
                <Text style={styles.identityName} numberOfLines={1}>
                  {displayName}
                </Text>
                <Text style={styles.identityEmail} numberOfLines={2}>
                  {email}
                </Text>
                <View style={styles.rolePill}>
                  <ShieldCheck
                    size={11}
                    color="rgba(255,255,255,0.82)"
                    strokeWidth={2.2}
                  />
                  <Text style={styles.roleText}>Parent account</Text>
                </View>
              </View>
            </View>
            <View style={styles.identityMeta}>
              <View style={styles.metaTile}>
                <Building2
                  size={15}
                  color="rgba(255,255,255,0.84)"
                  strokeWidth={2}
                />
                <View style={styles.metaCopy}>
                  <Text style={styles.metaLabel}>SCHOOL</Text>
                  <Text style={styles.metaValue} numberOfLines={2}>
                    {school}
                  </Text>
                </View>
              </View>
              <View style={styles.metaTile}>
                <UsersRound
                  size={15}
                  color="rgba(255,255,255,0.84)"
                  strokeWidth={2}
                />
                <View style={styles.metaCopy}>
                  <Text style={styles.metaLabel}>LINKED CHILDREN</Text>
                  <Text style={styles.metaValue} numberOfLines={1}>
                    {childrenLoading
                      ? "—"
                      : `${childCount} ${
                          children.length === 1 ? "child" : "children"
                        }`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(100).duration(400)}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Payment methods</Text>
              <Text style={styles.sectionSubtitle}>
                Choose how you’d like to pay school fees.
              </Text>
            </View>
            <PressableScale
              accessibilityLabel="Manage payment methods"
              onPress={() => openPaymentSheet()}
              style={styles.manage}
            >
              <Text style={styles.manageText}>Manage</Text>
              <ChevronRight size={14} color={colors.blue} strokeWidth={2.4} />
            </PressableScale>
          </View>

          <PressableScale
            accessibilityLabel="Change payment method"
            onPress={() => openPaymentSheet()}
            style={styles.paymentSummary}
          >
            {selectedPayment ? (
              <>
                <PaymentLogo method={selectedPayment.id} size={46} />
                <View style={styles.paymentSummaryCopy}>
                  <Text style={styles.paymentSummaryName} numberOfLines={1}>
                    {selectedPayment.name}
                  </Text>
                  <Text style={styles.paymentSummaryMeta}>
                    {selectedPayment.caption}
                  </Text>
                </View>
                <View style={styles.defaultPill}>
                  <Check size={10} color={colors.success} strokeWidth={3} />
                  <Text style={styles.defaultText}>Default</Text>
                </View>
                <ChevronRight
                  size={18}
                  color={colors.mutedLight}
                  strokeWidth={2.2}
                />
              </>
            ) : (
              <>
                <View style={styles.walletIcon}>
                  <Wallet size={20} color={colors.blue} strokeWidth={2} />
                </View>
                <View style={styles.paymentSummaryCopy}>
                  <Text style={styles.paymentSummaryName}>
                    Set up a payment method
                  </Text>
                  <Text style={styles.paymentSummaryMeta}>
                    Choose how you’d like to pay fees.
                  </Text>
                </View>
                <ChevronRight
                  size={18}
                  color={colors.mutedLight}
                  strokeWidth={2.2}
                />
              </>
            )}
          </PressableScale>

          <View style={styles.methodGrid}>
            {PAYMENT_METHODS.map((method, index) => {
              const active = defaultMethod === method.id;
              return (
                <Animated.View
                  key={method.id}
                  entering={FadeInUp.delay(140 + index * 40).duration(300)}
                  style={styles.methodCell}
                >
                  <PressableScale
                    accessibilityLabel={`Use ${method.name}`}
                    onPress={() => openPaymentSheet(method.id)}
                    style={[
                      styles.methodCard,
                      active && styles.methodCardActive,
                    ]}
                  >
                    <View style={styles.methodCardTop}>
                      <PaymentLogo method={method.id} size={42} />
                      {active ? (
                        <View style={styles.selectedCheck}>
                          <Check size={11} color="#FFFFFF" strokeWidth={3.2} />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={styles.methodCardName}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {method.name}
                    </Text>
                    <Text style={styles.methodCardCaption}>
                      {method.caption}
                    </Text>
                  </PressableScale>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.paymentNote}>
            <LockKeyhole size={14} color={colors.blue} strokeWidth={2.1} />
            <Text style={styles.paymentNoteText}>
              Card payments are available only where your school supports them.
              Acadex never stores your card details.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(210).duration(400)}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Account details</Text>
              <Text style={styles.sectionSubtitle}>
                Your verified parent account.
              </Text>
            </View>
            <Text style={styles.managed}>School managed</Text>
          </View>
          <View style={styles.card}>
            <InfoRow icon={Mail} label="EMAIL ADDRESS" value={email} />
            <Divider />
            <InfoRow icon={Building2} label="SCHOOL" value={school} />
            <Divider />
            <InfoRow
              icon={ShieldCheck}
              label="SCHOOL WORKSPACE"
              value={workspace}
            />
            <Divider />
            <InfoRow
              icon={BadgeCheck}
              label="ACCOUNT STATUS"
              value="School verified"
              trailing={
                <View style={styles.activePill}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Active</Text>
                </View>
              }
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(270).duration(400)}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>Preferences & security</Text>
              <Text style={styles.sectionSubtitle}>
                Notifications, privacy and support.
              </Text>
            </View>
          </View>
          <View style={styles.card}>
            {settings.map((setting, index) => {
              const Icon = setting.icon;
              return (
                <View key={setting.title}>
                  {index > 0 ? <View style={styles.settingDivider} /> : null}
                  <PressableScale
                    accessibilityLabel={setting.title}
                    onPress={setting.action}
                    style={styles.settingRow}
                  >
                    <View style={styles.settingIcon}>
                      <Icon size={17} color={colors.blue} strokeWidth={2.1} />
                    </View>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingTitle}>{setting.title}</Text>
                      <Text style={styles.settingSubtitle}>
                        {setting.subtitle}
                      </Text>
                    </View>
                    {setting.detail ? (
                      <Text style={styles.settingDetail}>{setting.detail}</Text>
                    ) : null}
                    <ChevronRight
                      size={17}
                      color={colors.mutedLight}
                      strokeWidth={2.2}
                    />
                  </PressableScale>
                </View>
              );
            })}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(330).duration(400)}>
          <PressableScale
            accessibilityLabel="Sign out"
            onPress={confirmSignOut}
            style={styles.logoutCard}
          >
            <View style={styles.logoutIcon}>
              <LogOut size={18} color={colors.danger} strokeWidth={2.1} />
            </View>
            <View style={styles.logoutCopy}>
              <Text style={styles.logoutTitle}>Sign out</Text>
              <Text style={styles.logoutSubtitle}>
                You’ll need your school credentials to return.
              </Text>
            </View>
            <ChevronRight size={18} color={colors.danger} strokeWidth={2.2} />
          </PressableScale>
        </Animated.View>

        <Text style={styles.version}>
          Acadex Connect v{Constants.expoConfig?.version ?? "1.0"} · Parent
          access
        </Text>
      </ScrollView>

      {sheetOpen ? (
        <PaymentMethodsSheet
          visible
          value={sheetSelection}
          onClose={() => setSheetOpen(false)}
          onSave={savePaymentMethod}
        />
      ) : null}
    </View>
  );
}

function initialsFor(name: string) {
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "P"
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function InfoRow({
  icon: Icon,
  label,
  value,
  trailing,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon size={17} color={colors.blue} strokeWidth={2.1} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: PAGE,
    borderBottomWidth: 1,
    borderBottomColor: "#EAF0F8",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: {
    color: colors.mutedLight,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.4,
    marginBottom: 1,
  },
  title: {
    color: colors.ink,
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 11.5,
    lineHeight: 17,
    marginTop: 2,
    maxWidth: 300,
  },
  headerHelp: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: "#DCE8FA",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 5,
    paddingBottom: 30,
    gap: 18,
  },
  identity: {
    borderRadius: 24,
    padding: 17,
    overflow: "hidden",
    shadowColor: "#062A73",
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  identityOrbLarge: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -72,
    right: -48,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  identityOrbSmall: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    bottom: -34,
    left: -24,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  identityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  avatarCheck: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  identityCopy: { flex: 1, minWidth: 0, gap: 2 },
  identityName: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  identityEmail: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 9.5,
    lineHeight: 12.5,
  },
  rolePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  roleText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 9,
    fontWeight: "700",
  },
  identityMeta: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
  },
  metaTile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  metaCopy: { flex: 1, minWidth: 0, gap: 1 },
  metaLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 7,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  metaValue: {
    color: "#FFFFFF",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 1 },
  sectionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    color: colors.muted,
    fontSize: 10.5,
    lineHeight: 15,
  },
  manage: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingVertical: 4,
  },
  manageText: {
    color: colors.blue,
    fontSize: 10.5,
    fontWeight: "700",
  },
  managed: {
    color: colors.muted,
    fontSize: 9.5,
    fontWeight: "600",
    marginBottom: 2,
  },
  paymentSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 72,
    padding: 13,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  paymentSummaryCopy: { flex: 1, minWidth: 0, gap: 2 },
  paymentSummaryName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
  },
  paymentSummaryMeta: {
    color: colors.muted,
    fontSize: 10,
  },
  defaultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
  defaultText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800",
  },
  walletIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  methodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 10,
  },
  methodCell: { width: "48.5%" },
  methodCard: {
    minHeight: 112,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  methodCardActive: {
    borderColor: colors.blue,
    backgroundColor: "#F7FAFF",
  },
  methodCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  selectedCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  methodCardName: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
    maxWidth: "100%",
    letterSpacing: -0.2,
  },
  methodCardCaption: {
    color: colors.muted,
    fontSize: 9.5,
    marginTop: 2,
  },
  paymentNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 13,
    backgroundColor: colors.blueSoft,
    borderWidth: 1,
    borderColor: "#D8E9FC",
  },
  paymentNoteText: {
    flex: 1,
    color: colors.blueDeep,
    fontSize: 9.5,
    lineHeight: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 4,
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  infoRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  infoCopy: { flex: 1, minWidth: 0, gap: 2 },
  infoLabel: {
    color: colors.mutedLight,
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  infoValue: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 47,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.successSoft,
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  activeText: {
    color: colors.success,
    fontSize: 9,
    fontWeight: "800",
  },
  settingRow: {
    minHeight: 57,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  settingCopy: { flex: 1, minWidth: 0, gap: 2 },
  settingTitle: {
    color: colors.ink,
    fontSize: 12.5,
    fontWeight: "700",
  },
  settingSubtitle: {
    color: colors.muted,
    fontSize: 9.5,
  },
  settingDetail: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "600",
  },
  settingDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 47,
  },
  logoutCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 13,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#FFD2D1",
    backgroundColor: "#FFF8F8",
  },
  logoutIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "#FFE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutCopy: { flex: 1, minWidth: 0, gap: 2 },
  logoutTitle: {
    color: colors.danger,
    fontSize: 12.5,
    fontWeight: "800",
  },
  logoutSubtitle: {
    color: "#B85C58",
    fontSize: 9.5,
  },
  version: {
    color: colors.mutedLight,
    fontSize: 9.5,
    textAlign: "center",
    marginTop: -3,
  },
});
