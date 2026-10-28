import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowLeft } from "lucide-react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { insightColors } from "../../features/insights";
import { PressableScale } from "./InsightVisuals";

export function PageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      entering={FadeInDown.duration(320)}
      style={[styles.header, { paddingTop: insets.top + 4 }]}
    >
      <PressableScale
        accessibilityLabel="Go back"
        onPress={onBack}
        style={styles.back}
      >
        <ArrowLeft size={20} color={insightColors.blue} strokeWidth={2.5} />
      </PressableScale>
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 16,
    paddingBottom: 9,
    backgroundColor: insightColors.page,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: insightColors.blueSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#DCE8FA",
  },
  copy: { flex: 1, minWidth: 0, gap: 1 },
  title: {
    color: insightColors.ink,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  subtitle: {
    color: insightColors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  right: { marginLeft: "auto" },
});
