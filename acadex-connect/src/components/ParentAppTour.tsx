import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CircleCheck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { Badge } from "./ui/badge";
import { Button, buttonTextVariants } from "./ui/button";
import { Card } from "./ui/card";
import { Icon } from "./ui/icon";
import { Text } from "./ui/text";
import { useAuth } from "../services/auth";

const steps: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  tint: string;
  hint: string;
}[] = [
  {
    icon: UsersRound,
    eyebrow: "YOUR FAMILY",
    title: "All your children, one account.",
    description:
      "Your linked children appear on Home. Tap a child’s card to switch whose attendance, fees and learning progress you’re viewing.",
    accent: "#315DF5",
    tint: "#EAF0FF",
    hint: "Switch children from the cards at the top of Home",
  },
  {
    icon: CalendarDays,
    eyebrow: "A QUICK OVERVIEW",
    title: "See how their school day is going.",
    description:
      "Home brings together attendance, published grades, fee payments and upcoming school events. Tap a summary to open its details.",
    accent: "#16845B",
    tint: "#E8F7F0",
    hint: "Attendance · Academics · Fees · Events",
  },
  {
    icon: BellRing,
    eyebrow: "STAY CONNECTED",
    title: "School updates stay within reach.",
    description:
      "Open Updates to read announcements and notifications. The bell at the top of Home also shows when you have unread messages.",
    accent: "#1386C7",
    tint: "#E7F6FF",
    hint: "Find school notices in the Updates tab",
  },
  {
    icon: BookOpenCheck,
    eyebrow: "READY WHEN YOU ARE",
    title: "Explore their full school record.",
    description:
      "Use My Children to switch profiles, Academics to open published report cards, and Profile to manage your account and settings.",
    accent: "#315DF5",
    tint: "#EAF0FF",
    hint: "Your navigation is always at the bottom",
  },
];

export function ParentAppTour() {
  const { parent } = useAuth();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const step = steps[stepIndex];
  const storageKey = parent
    ? `acadex-connect.parent-tour-complete.${parent.user_id}`
    : null;

  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    void SecureStore.getItemAsync(storageKey)
      .then((complete) => {
        if (active && complete !== "true") setVisible(true);
      })
      .catch(() => {
        if (active) setVisible(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  const dismiss = async () => {
    if (finishing) return;
    setFinishing(true);
    if (storageKey) {
      try {
        await SecureStore.setItemAsync(storageKey, "true");
      } catch {
        // Keep the signed-in experience available if local storage is unavailable.
      }
    }
    setVisible(false);
    setFinishing(false);
  };

  const next = () => {
    if (stepIndex === steps.length - 1) void dismiss();
    else setStepIndex((current) => current + 1);
  };

  if (!visible || !parent) return null;

  return (
    <View
      style={styles.scrim}
      accessibilityViewIsModal
      accessibilityLabel="Acadex parent app tour"
    >
      <Animated.View entering={FadeIn.duration(180)} style={styles.backdrop} />
      <View
        style={[
          styles.frame,
          {
            paddingTop: insets.top + 8,
            paddingBottom: Math.max(insets.bottom, 14) + 8,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Badge className="border border-white/70 bg-white/90 px-3 py-1.5">
            <Icon as={CircleCheck} size={13} className="text-blue-600" />
            <Text className="text-[11px] font-bold tracking-[1px] text-blue-700">
              ACADEX QUICK TOUR
            </Text>
          </Badge>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip app tour"
            onPress={() => void dismiss()}
            hitSlop={10}
            style={styles.skipButton}
          >
            <Text className="text-sm font-semibold text-white">Skip</Text>
            <Icon as={X} size={16} color="#FFFFFF" />
          </Pressable>
        </View>

        <View style={styles.spacer} />

        <Animated.View
          key={stepIndex}
          entering={SlideInRight.duration(280).springify().damping(22)}
          exiting={FadeOut.duration(100)}
        >
          <Card className="gap-0 overflow-hidden rounded-[30px] border border-white/80 bg-white px-5 pb-5 pt-5 shadow-2xl shadow-[#081C49]/20">
            <View className="mb-5 flex-row items-center justify-between">
              <Text className="text-xs font-bold tracking-[1.2px] text-slate-400">
                {String(stepIndex + 1).padStart(2, "0")} /{" "}
                {String(steps.length).padStart(2, "0")}
              </Text>
              <View
                style={styles.progressRow}
                accessibilityLabel={`Tour step ${stepIndex + 1} of ${steps.length}`}
              >
                {steps.map((item, index) => (
                  <View
                    key={item.eyebrow}
                    style={[
                      styles.progressDot,
                      index === stepIndex
                        ? styles.progressActive
                        : styles.progressInactive,
                    ]}
                  />
                ))}
              </View>
            </View>

            <View className="mb-5 flex-row items-center gap-4">
              <View
                className="h-[62px] w-[62px] items-center justify-center rounded-[22px]"
                style={{ backgroundColor: step.tint }}
              >
                <Icon
                  as={step.icon}
                  size={29}
                  color={step.accent}
                  strokeWidth={2}
                />
              </View>
              <View className="flex-1">
                <Text className="mb-1 text-[10px] font-extrabold tracking-[1.4px] text-blue-600">
                  {step.eyebrow}
                </Text>
                <View className="h-1 w-10 rounded-full bg-blue-100" />
              </View>
            </View>

            <Text
              variant="h3"
              className="text-left text-[25px] leading-[31px] font-bold tracking-[-0.6px] text-slate-950"
            >
              {step.title}
            </Text>
            <Text className="mt-3 text-[14px] leading-[22px] text-slate-600">
              {step.description}
            </Text>

            <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-[#F3F7FF] px-3.5 py-3">
              <Icon as={CircleCheck} size={16} className="text-blue-600" />
              <Text className="flex-1 text-xs font-semibold leading-[18px] text-blue-800">
                {step.hint}
              </Text>
            </View>

            <View className="mt-6 flex-row items-center gap-3">
              {stepIndex > 0 ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-[52px] w-[52px] rounded-2xl border-slate-200 bg-white"
                  onPress={() => setStepIndex((current) => current - 1)}
                  accessibilityLabel="Previous tour step"
                >
                  <Icon as={ArrowLeft} size={19} className="text-slate-700" />
                </Button>
              ) : null}
              <Button
                className="h-[52px] flex-1 rounded-2xl bg-blue-600 shadow-md shadow-blue-600/20 active:bg-blue-700"
                onPress={next}
                disabled={finishing}
                accessibilityLabel={
                  stepIndex === steps.length - 1
                    ? "Finish app tour"
                    : "Next tour step"
                }
              >
                <Text className={buttonTextVariants({ size: "lg" })}>
                  {stepIndex === steps.length - 1
                    ? "Explore Acadex"
                    : "Continue"}
                </Text>
                <Icon
                  as={stepIndex === steps.length - 1 ? CircleCheck : ArrowRight}
                  size={18}
                  className="text-white"
                />
              </Button>
            </View>
          </Card>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    justifyContent: "space-between",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(9, 23, 52, 0.68)",
  },
  frame: { flex: 1, paddingHorizontal: 20 },
  topRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  skipButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
  },
  spacer: { flex: 1, minHeight: 24 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressDot: { height: 6, borderRadius: 4 },
  progressActive: { width: 22, backgroundColor: "#315DF5" },
  progressInactive: { width: 6, backgroundColor: "#D9E2F1" },
});
