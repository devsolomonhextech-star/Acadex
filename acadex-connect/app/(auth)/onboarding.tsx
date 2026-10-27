import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  SlideInRight,
  SlideOutLeft,
} from "react-native-reanimated";
import {
  ArrowRight,
  BellRing,
  BookOpenCheck,
  CalendarCheck2,
  ChevronRight,
  CircleCheck,
  GraduationCap,
  HeartHandshake,
  ShieldCheck,
  WalletCards,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "../../src/components/ui/badge";
import { Button, buttonTextVariants } from "../../src/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../src/components/ui/card";
import { Icon } from "../../src/components/ui/icon";
import { Text } from "../../src/components/ui/text";

const ONBOARDING_KEY = "acadex-parent-onboarding-complete";

const slides = [
  {
    eyebrow: "A clearer school day",
    title: "Your child’s school life, all in one place.",
    body: "See attendance, learning progress, fees and school updates from one simple parent app.",
    icon: GraduationCap,
    tag: "Everything connected",
    detail: "A better view of every school day",
    color: "#315DF5",
    tint: "#EAF0FF",
  },
  {
    eyebrow: "Stay in the loop",
    title: "Be there for every important moment.",
    body: "Get timely announcements and follow attendance, assignments and published results as they happen.",
    icon: BellRing,
    tag: "School updates, within reach",
    detail: "The moments that matter, made clear",
    color: "#1386C7",
    tint: "#E7F6FF",
  },
  {
    eyebrow: "Made for families",
    title: "Support their progress with confidence.",
    body: "Manage linked children, understand school fees and reach your school without another office visit.",
    icon: HeartHandshake,
    tag: "One account for your family",
    detail: "A closer connection to your school",
    color: "#315DF5",
    tint: "#EAF0FF",
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
      if (complete === "true") router.replace("/(auth)/login");
    });
  }, []);

  const finish = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await SecureStore.setItemAsync(ONBOARDING_KEY, "true");
    } catch {
      // Continue to sign-in even if the device cannot persist onboarding state.
    }
    router.replace("/(auth)/login");
  };

  const next = () => {
    if (isLast) void finish();
    else setStep((current) => current + 1);
  };

  return (
    <View
      className="flex-1 bg-[#F6F9FF]"
      style={{
        paddingTop: insets.top + 10,
        paddingBottom: Math.max(insets.bottom, 18),
      }}
    >
      <View className="flex-row items-center justify-between px-6">
        <Image
          source={require("../../assets/images/acadex-logo.png")}
          className="h-10 w-[132px]"
          resizeMode="contain"
          accessibilityLabel="Acadex"
        />
        <Pressable
          onPress={() => void finish()}
          className="min-h-11 items-center justify-center rounded-full px-3"
          accessibilityRole="button"
          accessibilityLabel="Skip introduction"
        >
          <Text className="text-sm font-semibold text-slate-500">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1 justify-center px-6 pb-3 pt-5">
        <Animated.View
          key={`visual-${step}`}
          entering={FadeIn.duration(260)}
          exiting={FadeOut.duration(120)}
        >
          <HeroScene step={step} />
        </Animated.View>

        <Animated.View
          key={`copy-${step}`}
          entering={SlideInRight.duration(300).springify().damping(20)}
          exiting={SlideOutLeft.duration(140)}
          className="items-center px-2 pt-8"
        >
          <Badge
            className="mb-4 border-0 bg-blue-100 px-3 py-1.5"
            variant="secondary"
          >
            <Icon as={CircleCheck} size={13} className="text-blue-700" />
            <Text className="text-xs font-semibold text-blue-800">
              {slide.eyebrow}
            </Text>
          </Badge>
          <Text
            variant="h1"
            className="max-w-[360px] text-center text-[31px] leading-[38px] font-bold tracking-[-0.8px] text-slate-950"
          >
            {slide.title}
          </Text>
          <Text className="mt-3 max-w-[340px] text-center text-[15px] leading-6 text-slate-500">
            {slide.body}
          </Text>
        </Animated.View>
      </View>

      <Animated.View
        entering={FadeInDown.delay(120).duration(300)}
        className="px-6"
      >
        <View
          className="mb-6 flex-row items-center justify-center gap-2"
          accessibilityLabel={`Screen ${step + 1} of ${slides.length}`}
        >
          {slides.map((item, index) => (
            <View
              key={item.eyebrow}
              className={`h-2 rounded-full ${index === step ? "w-7 bg-blue-600" : "w-2 bg-blue-200"}`}
            />
          ))}
        </View>
        <Button
          size="lg"
          className="h-[56px] w-full rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/20 active:bg-blue-700"
          onPress={next}
          disabled={starting}
          accessibilityLabel={
            isLast ? "Continue to parent sign in" : "Continue onboarding"
          }
        >
          <Text className={buttonTextVariants({ size: "lg" })}>
            {isLast ? "Get started" : "Continue"}
          </Text>
          <Icon as={ArrowRight} size={19} className="text-white" />
        </Button>
        <View className="mt-4 flex-row items-center justify-center gap-1">
          <ShieldCheck size={14} color="#6B7C98" />
          <Text className="text-xs text-slate-500">
            Your family’s information stays private
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

function HeroScene({ step }: { step: number }) {
  const slide = slides[step];
  const MainIcon = slide.icon;
  return (
    <View className="h-[268px] items-center justify-center">
      <View className="absolute h-[238px] w-[290px] rounded-[44px] bg-[#EAF1FF]" />
      <View className="absolute left-5 top-4 h-16 w-16 rounded-full bg-white/80" />
      <View className="absolute bottom-5 right-4 h-12 w-12 rounded-full bg-[#DAE6FF]" />
      <Animated.View
        entering={FadeInDown.duration(420).springify()}
        className="h-[174px] w-[174px] items-center justify-center rounded-[46px] border border-white bg-white shadow-xl shadow-blue-900/10"
      >
        <View
          className="h-[120px] w-[120px] items-center justify-center rounded-[36px]"
          style={{ backgroundColor: slide.tint }}
        >
          <Icon as={MainIcon} size={55} color={slide.color} strokeWidth={1.8} />
        </View>
        <View className="absolute -right-3 top-5 h-10 w-10 items-center justify-center rounded-2xl border-4 border-white bg-blue-600">
          <Icon as={CircleCheck} size={18} color="#FFFFFF" strokeWidth={2.5} />
        </View>
      </Animated.View>

      <FloatingCard
        className="absolute left-0 top-[32px]"
        icon={CalendarCheck2}
        label={step === 1 ? "Attendance" : "School day"}
        value={step === 1 ? "Here today" : "All in view"}
        accent="#16A879"
      />
      <FloatingCard
        className="absolute bottom-[26px] right-0"
        icon={step === 2 ? WalletCards : BookOpenCheck}
        label={step === 2 ? "Family account" : "Learning progress"}
        value={step === 2 ? "Fees made simple" : "Moving forward"}
        accent="#315DF5"
      />

      <Card className="absolute bottom-0 left-1/2 w-[194px] -translate-x-1/2 flex-row items-center gap-2 rounded-2xl border-white/90 bg-white/95 px-3 py-2 shadow-md shadow-blue-900/10">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
          <Icon as={ShieldCheck} size={17} className="text-blue-600" />
        </View>
        <View className="flex-1">
          <CardTitle className="text-[10px] leading-4 text-slate-900">
            {slide.tag}
          </CardTitle>
          <CardDescription className="text-[9px] leading-3 text-slate-500">
            {slide.detail}
          </CardDescription>
        </View>
        <Icon as={ChevronRight} size={14} className="text-slate-400" />
      </Card>
    </View>
  );
}

function FloatingCard({
  className,
  icon,
  label,
  value,
  accent,
}: {
  className: string;
  icon: typeof CalendarCheck2;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(140).duration(350)}
      className={className}
    >
      <Card className="min-w-[125px] flex-row items-center gap-2 rounded-2xl border-white/90 bg-white px-3 py-2.5 shadow-lg shadow-blue-900/10">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-blue-50">
          <Icon as={icon} size={16} color={accent} />
        </View>
        <CardHeader className="gap-0 px-0">
          <CardDescription className="text-[9px] leading-3">
            {label}
          </CardDescription>
          <CardTitle className="text-[10px] leading-4 text-slate-900">
            {value}
          </CardTitle>
        </CardHeader>
      </Card>
    </Animated.View>
  );
}
