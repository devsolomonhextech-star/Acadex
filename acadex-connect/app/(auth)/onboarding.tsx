import { useEffect, useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { ArrowRight, Check, ShieldCheck } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "../../src/components/insights/InsightVisuals";
import { colors } from "../../src/theme/tokens";

const logo = require("../../assets/images/acadex-logo.png");
const school3d = require("../../assets/images/3d/school.webp");
const megaphone3d = require("../../assets/images/3d/megaphone.webp");
const graduationCap3d = require("../../assets/images/3d/graduation-cap.webp");

const ONBOARDING_KEY = "acadex-parent-onboarding-complete";

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
  imageLabel: string;
  gradient: [string, string];
  accent: string;
  tint: string;
  tag: string;
};

const slides: Slide[] = [
  {
    eyebrow: "EVERYTHING IN ONE PLACE",
    title: "Your child’s school life, all in one place.",
    body: "Attendance, learning progress, fees and school updates — clear, connected and easy to follow.",
    image: school3d,
    imageLabel: "3D illustration of a school",
    gradient: ["#EAF3FF", "#F9FCFF"],
    accent: "#315DF5",
    tint: "#EAF3FF",
    tag: "Everything connected",
  },
  {
    eyebrow: "STAY IN THE LOOP",
    title: "Be there for every important moment.",
    body: "School announcements and published results arrive as they happen, so nothing slips past you.",
    image: megaphone3d,
    imageLabel: "3D illustration of school announcements",
    gradient: ["#E7F6FF", "#F9FDFF"],
    accent: "#1386C7",
    tint: "#E7F6FF",
    tag: "School updates, within reach",
  },
  {
    eyebrow: "MADE FOR FAMILIES",
    title: "Support their progress with confidence.",
    body: "Manage linked children, understand school fees and reach your school without another office visit.",
    image: graduationCap3d,
    imageLabel: "3D illustration of learning progress",
    gradient: ["#EEF5FF", "#FBFDFF"],
    accent: "#315DF5",
    tint: "#EEF5FF",
    tag: "One account for your family",
  },
];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [starting, setStarting] = useState(false);
  const slide = slides[step];
  const isLast = step === slides.length - 1;

  useEffect(() => {
    void SecureStore.getItemAsync(ONBOARDING_KEY).then((complete) => {
      // TEMP PREVIEW
      // if (complete === "true") router.replace("/(auth)/login");
    });
  }, []);

  const finish = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    } catch {
      // Continue to sign-in even if the device cannot persist onboarding.
    }
    router.replace("/(auth)/login");
  };

  const next = () => {
    if (isLast) void finish();
    else setStep((current) => current + 1);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <Animated.View
        entering={FadeInDown.duration(320)}
        style={[styles.topBar, { paddingTop: insets.top + 6 }]}
      >
        <Image source={logo} resizeMode="contain" style={styles.logo} />
        <PressableScale
          accessibilityLabel="Skip introduction"
          onPress={() => void finish()}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Skip</Text>
        </PressableScale>
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          key={`visual-${step}`}
          entering={FadeIn.duration(280)}
          exiting={FadeOut.duration(140)}
        >
          <HeroScene slide={slide} />
        </Animated.View>

        <Animated.View
          key={`copy-${step}`}
          entering={SlideInRight.duration(320).springify().damping(21)}
          exiting={SlideOutLeft.duration(140)}
          style={styles.copy}
        >
          <Text style={[styles.eyebrow, { color: slide.accent }]}>
            {slide.eyebrow}
          </Text>
          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
          <View
            style={[
              styles.tag,
              {
                backgroundColor: slide.tint,
                borderColor: `${slide.accent}24`,
              },
            ]}
          >
            <View style={styles.tagIcon}>
              <Check size={11} color={slide.accent} strokeWidth={3} />
            </View>
            <Text style={[styles.tagText, { color: slide.accent }]}>
              {slide.tag}
            </Text>
          </View>
        </Animated.View>
      </ScrollView>

      <Animated.View
        entering={FadeInUp.delay(120).duration(340)}
        style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}
      >
        <View
          style={styles.dots}
          accessibilityLabel={`Screen ${step + 1} of ${slides.length}`}
        >
          {slides.map((item, index) => (
            <View
              key={item.eyebrow}
              style={[
                styles.dot,
                index === step ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
        <PressableScale
          accessibilityLabel={
            isLast ? "Continue to parent sign in" : "Continue onboarding"
          }
          disabled={starting}
          onPress={next}
          style={[styles.primary, starting && styles.primaryDisabled]}
        >
          <LinearGradient
            colors={["#155EEF", "#2D8CFF"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.primaryText}>
            {isLast ? "Get started" : "Continue"}
          </Text>
          {isLast ? (
            <Check size={17} color="#FFFFFF" strokeWidth={2.8} />
          ) : (
            <ArrowRight size={17} color="#FFFFFF" strokeWidth={2.6} />
          )}
        </PressableScale>
        <View style={styles.privacy}>
          <ShieldCheck size={13} color={colors.muted} strokeWidth={2.1} />
          <Text style={styles.privacyText}>
            Your family’s information stays private
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function HeroScene({ slide }: { slide: Slide }) {
  return (
    <View style={styles.heroShadow}>
      <View style={styles.hero}>
        <LinearGradient
          colors={slide.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.heroHalo} />
        <View style={styles.heroRing} />
        <View style={styles.heroDot} />
        <FloatingAsset source={slide.image} label={slide.imageLabel} />
      </View>
    </View>
  );
}

function FloatingAsset({
  source,
  label,
}: {
  source: ImageSourcePropType;
  label: string;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, {
        duration: 5000,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true,
    );
  }, [drift]);
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * 7 }],
  }));
  return (
    <Animated.View style={[styles.assetWrap, floatStyle]}>
      <Image
        source={source}
        resizeMode="contain"
        accessibilityLabel={label}
        style={styles.asset}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F9FF" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingBottom: 6,
  },
  logo: { width: 130, height: 38 },
  skip: {
    minHeight: 35,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2EAF6",
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    color: colors.muted,
    fontSize: 11.5,
    fontWeight: "700",
  },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 6, paddingBottom: 8 },
  heroShadow: {
    marginHorizontal: 20,
    borderRadius: 30,
    backgroundColor: "#FFFFFF",
    shadowColor: "#1B4F8A",
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 3,
  },
  hero: {
    height: 292,
    borderRadius: 30,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  heroHalo: {
    position: "absolute",
    width: 184,
    height: 184,
    borderRadius: 92,
    backgroundColor: "rgba(255,255,255,0.52)",
  },
  heroRing: {
    position: "absolute",
    width: 238,
    height: 238,
    borderRadius: 119,
    borderWidth: 1,
    borderColor: "rgba(49,93,245,0.09)",
  },
  heroDot: {
    position: "absolute",
    top: 22,
    right: 24,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "rgba(49,93,245,0.22)",
  },
  assetWrap: {
    width: 224,
    height: 206,
    alignItems: "center",
    justifyContent: "center",
  },
  asset: { width: 214, height: 198 },
  copy: {
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 10,
    alignItems: "flex-start",
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1.35,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.9,
    marginTop: 8,
    maxWidth: 350,
  },
  body: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
    maxWidth: 350,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  tagIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tagText: {
    fontSize: 10,
    fontWeight: "800",
  },
  bottom: {
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: "#F6F9FF",
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginBottom: 16,
  },
  dot: { height: 6, borderRadius: 3 },
  dotActive: { width: 28, backgroundColor: colors.blue },
  dotInactive: { width: 7, backgroundColor: "#D6E2F4" },
  primary: {
    minHeight: 54,
    borderRadius: 16,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#155EEF",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryDisabled: { opacity: 0.55 },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  privacy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 12,
  },
  privacyText: {
    color: colors.muted,
    fontSize: 9.5,
  },
});
