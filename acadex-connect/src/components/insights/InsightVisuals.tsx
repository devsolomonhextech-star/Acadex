import type { PropsWithChildren, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { insightColors } from "../../features/insights";
import type { LucideIcon } from "lucide-react-native";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AnimatedNumberText({
  value,
  style,
  format,
  prefix,
  suffix,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  format?: (value: number) => string;
  prefix?: string;
  suffix?: string;
}) {
  const animated = useCountUp(value);
  return (
    <Text style={style}>
      {prefix}
      {format ? format(animated) : Math.round(animated)}
      {suffix}
    </Text>
  );
}

export function FloatingOrb({
  style,
  distance,
  duration,
}: {
  style: StyleProp<ViewStyle>;
  distance: number;
  duration: number;
}) {
  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [drift, duration]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: drift.value * distance },
      { translateX: drift.value * distance * -0.45 },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[style, animatedStyle]} />;
}

export function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);
  return value;
}

export function InsightSectionHeader({
  icon: Icon,
  title,
  subtitle,
  tint,
  color,
  right,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tint: string;
  color: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: tint }]}>
        <Icon size={17} color={color} strokeWidth={2.2} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      {right}
    </View>
  );
}

export function AnimatedRing({
  size = 112,
  strokeWidth = 9,
  percent,
  color = insightColors.mint,
  trackColor = "rgba(255,255,255,0.24)",
  children,
}: PropsWithChildren<{
  size?: number;
  strokeWidth?: number;
  percent: number;
  color?: string;
  trackColor?: string;
}>) {
  const value = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(value, {
      duration: 1100,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeLinecap="round"
          fill="none"
          animatedProps={animatedProps}
        />
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

export function DonutChart({
  segments,
  size = 128,
  strokeWidth = 15,
  children,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  children?: ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <Animated.View
      entering={ZoomIn.duration(420)}
      style={{ width: size, height: size }}
    >
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={insightColors.track}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {segments.map((segment, index) => {
          if (!total || segment.value <= 0) return null;
          const arc = (segment.value / total) * circumference;
          const length = Math.max(arc - 3, 1);
          const dashOffset = -segments
            .slice(0, index)
            .reduce(
              (sum, previous) => sum + (previous.value / total) * circumference,
              0,
            );
          return (
            <Circle
              key={`${segment.color}-${index}`}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={segment.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              fill="none"
            />
          );
        })}
      </Svg>
      <View style={styles.ringCenter}>{children}</View>
    </Animated.View>
  );
}

export function AnimatedBar({
  value,
  height = 108,
  color,
  delay = 0,
}: {
  value: number;
  height?: number;
  color: string;
  delay?: number;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(value, {
        duration: 780,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [delay, progress, value]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: (Math.max(0, Math.min(100, progress.value)) / 100) * height,
  }));

  return (
    <View style={[styles.barTrack, { height }]}>
      <Animated.View style={[styles.barFill, animatedStyle]}>
        <LinearGradient
          colors={[color, `${color}CC`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function AnimatedProgressBar({
  percent,
  color,
  trackColor = insightColors.track,
  height = 11,
  delay = 0,
  radius,
}: {
  percent: number;
  color: string;
  trackColor?: string;
  height?: number;
  delay?: number;
  radius?: number;
}) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const clamped = Math.max(0, Math.min(100, percent));

  useEffect(() => {
    if (!width) return;
    progress.value = 0;
    progress.value = withDelay(
      delay,
      withTiming(clamped, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [clamped, delay, progress, width]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: (width * Math.max(0, Math.min(100, progress.value))) / 100,
  }));

  return (
    <View
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      style={[
        styles.progressTrack,
        {
          height,
          backgroundColor: trackColor,
          borderRadius: radius ?? height / 2,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: color,
            borderRadius: radius ?? height / 2,
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

export function PressableScale({
  children,
  onPress,
  style,
  accessibilityLabel,
  hitSlop,
  disabled,
}: PropsWithChildren<{
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  hitSlop?: number;
  disabled?: boolean;
}>) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(pressed ? 0.97 : 1, {
      damping: 16,
      stiffness: 240,
    });
  }, [pressed, scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export function SegmentedTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: string[];
  value: string;
  onChange: (tab: string) => void;
}) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, tabs.indexOf(value));
  const gap = 6;
  const padding = 4;
  const pillWidth =
    width > 0
      ? (width - padding * 2 - gap * (tabs.length - 1)) / tabs.length
      : 0;
  const translate = useSharedValue(0);

  useEffect(() => {
    if (!pillWidth) return;
    translate.value = withSpring(index * (pillWidth + gap), {
      damping: 19,
      stiffness: 190,
      mass: 0.8,
    });
  }, [index, pillWidth, translate]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
    width: pillWidth,
  }));

  return (
    <View
      onLayout={(event: LayoutChangeEvent) =>
        setWidth(event.nativeEvent.layout.width)
      }
      style={styles.tabsRail}
    >
      {pillWidth > 0 ? (
        <Animated.View style={[styles.tabPill, pillStyle]} />
      ) : null}
      {tabs.map((tab) => {
        const active = tab === value;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab)}
            style={styles.tabButton}
          >
            <Text
              style={[styles.tabLabel, active && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {tab}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  sectionIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionCopy: { flex: 1, minWidth: 0, gap: 1 },
  sectionTitle: {
    color: insightColors.ink,
    fontSize: 15.5,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    color: insightColors.muted,
    fontSize: 11,
  },
  ringCenter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  barTrack: {
    width: 28,
    borderRadius: 10,
    backgroundColor: insightColors.track,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  barFill: {
    width: "100%",
    borderRadius: 10,
    overflow: "hidden",
  },
  progressTrack: {
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
  },
  tabsRail: {
    height: 46,
    padding: 4,
    borderRadius: 16,
    backgroundColor: insightColors.blueSoft,
    borderWidth: 1,
    borderColor: "#DCE8FA",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
  },
  tabPill: {
    position: "absolute",
    top: 4,
    left: 4,
    height: 36,
    borderRadius: 12,
    backgroundColor: insightColors.blueBright,
    shadowColor: "#1F6BEE",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tabButton: {
    flex: 1,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabLabel: {
    color: insightColors.blueDeep,
    fontSize: 12.5,
    fontWeight: "700",
  },
  tabLabelActive: { color: "#FFFFFF" },
});
