import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Check } from "lucide-react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useChildren } from "../services/parentData";
import { insightColors, initialsOf } from "../features/insights";
import { PressableScale } from "./insights/InsightVisuals";

const AVATAR_TONES = [
  { background: "#E3ECFF", foreground: "#2F6BEA" },
  { background: "#EDE3FF", foreground: "#7B3FE4" },
  { background: "#D7F8F3", foreground: "#0E7C78" },
  { background: "#F0E4FF", foreground: "#7A3DE0" },
];

export function ChildSwitcher() {
  const { children, selectedChild, selectChild, isLoading, error, refetch } =
    useChildren();

  if (isLoading)
    return (
      <View style={styles.wrap}>
        <View style={styles.skeletonRail}>
          <ActivityIndicator color={insightColors.blue} size="small" />
          <Text style={styles.skeletonText}>Loading children…</Text>
        </View>
      </View>
    );

  if (error)
    return (
      <View style={styles.wrap}>
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>Children could not load.</Text>
          <PressableScale onPress={refetch} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </PressableScale>
        </View>
      </View>
    );

  if (!children.length) return null;

  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.wrap}>
      <View style={styles.headingRow}>
        <Text style={styles.eyebrow}>VIEWING</Text>
        <Text style={styles.count}>
          {children.length} {children.length === 1 ? "child" : "children"}
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {children.map((child, index) => {
          const active = child.id === selectedChild?.id;
          const tone = AVATAR_TONES[index % AVATAR_TONES.length];
          return (
            <PressableScale
              key={child.id}
              accessibilityLabel={`View ${child.first_name} ${child.last_name}`}
              onPress={() => selectChild(child.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: active
                      ? insightColors.blue
                      : tone.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.initials,
                    { color: active ? "#FFFFFF" : tone.foreground },
                  ]}
                >
                  {initialsOf(child.first_name, child.last_name)}
                </Text>
              </View>
              <Text
                style={[styles.name, active && styles.nameActive]}
                numberOfLines={1}
              >
                {child.first_name}
              </Text>
              {active ? (
                <View style={styles.check}>
                  <Check size={10} color="#FFFFFF" strokeWidth={3.4} />
                </View>
              ) : null}
            </PressableScale>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  eyebrow: {
    color: insightColors.mutedLight,
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  count: { color: insightColors.muted, fontSize: 10.5, fontWeight: "600" },
  rail: { gap: 8, paddingRight: 16 },
  chip: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: insightColors.border,
    backgroundColor: insightColors.card,
  },
  chipActive: {
    borderColor: insightColors.blue,
    backgroundColor: insightColors.blueSoft,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontSize: 10, fontWeight: "800" },
  name: {
    color: insightColors.ink,
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 92,
  },
  nameActive: { color: insightColors.blueDeep },
  check: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: insightColors.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  skeletonRail: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  skeletonText: { color: insightColors.muted, fontSize: 12 },
  errorRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: insightColors.redSoft,
  },
  errorText: { color: insightColors.redText, fontSize: 12, fontWeight: "600" },
  retry: { paddingHorizontal: 10, paddingVertical: 5 },
  retryText: { color: insightColors.redText, fontSize: 12, fontWeight: "800" },
});
