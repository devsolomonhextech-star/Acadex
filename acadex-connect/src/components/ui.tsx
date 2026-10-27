import type { PropsWithChildren, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type ViewStyle,
} from "react-native";
import { ArrowRight, CircleAlert, RefreshCw } from "lucide-react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { colors, radius, space } from "../theme/tokens";

export function Screen({
  children,
  contentStyle,
  ...props
}: PropsWithChildren<ScrollViewProps & { contentStyle?: ViewStyle }>) {
  return (
    <ScrollView
      {...props}
      contentContainerStyle={[styles.screen, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}
export function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Heading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}
export function PrimaryButton({
  title,
  onPress,
  busy,
  disabled,
  variant = "primary",
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "primary" | "quiet";
}) {
  const quiet = variant === "quiet";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        quiet && styles.buttonQuiet,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={quiet ? colors.blue : "#fff"} />
      ) : (
        <>
          <Text style={[styles.buttonText, quiet && styles.buttonQuietText]}>
            {title}
          </Text>
          <ArrowRight size={16} color={quiet ? colors.blue : "#fff"} />
        </>
      )}
    </Pressable>
  );
}
export function EmptyState({
  title,
  body,
  retry,
}: {
  title: string;
  body: string;
  retry?: () => void;
}) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <CircleAlert size={20} color={colors.blue} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {retry ? (
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={styles.retry}
        >
          <RefreshCw size={14} color={colors.blue} />
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}
export function LoadingState() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.blue} />
      <Text style={styles.subtitle}>Loading your school information…</Text>
    </View>
  );
}
export function OfflineBanner() {
  const net = useNetInfo();
  if (net.isConnected !== false && net.isInternetReachable !== false)
    return null;
  return (
    <View style={styles.offline}>
      <Text style={styles.offlineText}>
        You’re offline · Showing any information already loaded
      </Text>
    </View>
  );
}
export function LabelValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.labelValue}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: space.xl,
    paddingBottom: 44,
    gap: space.lg,
    backgroundColor: colors.background,
    flexGrow: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.sm,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: space.sm,
  },
  title: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 4 },
  button: {
    minHeight: 48,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    backgroundColor: colors.blue,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  buttonQuiet: { backgroundColor: colors.blueSoft },
  buttonQuietText: { color: colors.blue },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82 },
  empty: { alignItems: "center", paddingVertical: space.xxl },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 310,
  },
  retry: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8 },
  retryText: { color: colors.blue, fontWeight: "700" },
  loading: {
    flex: 1,
    minHeight: 180,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  offline: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "#FFF4DF",
    borderBottomColor: "#F4D59F",
    borderBottomWidth: 1,
  },
  offlineText: {
    color: "#80500B",
    fontSize: 11,
    textAlign: "center",
    fontWeight: "600",
  },
  labelValue: { flex: 1, gap: 4 },
  label: { color: colors.mutedLight, fontSize: 12, fontWeight: "600" },
  value: { color: colors.ink, fontSize: 16, fontWeight: "700" },
});
