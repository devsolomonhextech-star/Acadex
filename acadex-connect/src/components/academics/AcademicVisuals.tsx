import type { ReactNode } from "react";
import { useState } from "react";
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  type TextStyle,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";
import {
  BookOpen,
  Calculator,
  FlaskConical,
  Globe2,
  Languages,
  Monitor,
  Music,
  Palette,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { academicColors, type TrendPoint } from "../../features/academics";

export function ProgressRing({
  size = 58,
  strokeWidth = 6,
  progress,
  color,
  trackColor,
  label,
  labelSize = 13,
  labelColor = academicColors.ink,
  labelWeight = "800",
}: {
  size?: number;
  strokeWidth?: number;
  progress: number;
  color: string;
  trackColor?: string;
  label?: string;
  labelSize?: number;
  labelColor?: string;
  labelWeight?: TextStyle["fontWeight"];
}) {
  const value = Math.max(0, Math.min(100, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
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
          stroke={trackColor ?? `${color}26`}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <View style={styles.ringLabel}>
        <Text
          style={{
            color: labelColor,
            fontSize: labelSize,
            fontWeight: labelWeight,
            letterSpacing: -0.3,
          }}
        >
          {label ?? `${Math.round(value)}%`}
        </Text>
      </View>
    </View>
  );
}

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const [width, setWidth] = useState(0);
  const height = 172;
  const left = 34;
  const right = 12;
  const top = 10;
  const bottom = 28;
  const chartWidth = Math.max(width - left - right, 1);
  const chartHeight = height - top - bottom;
  const values = points.length ? points : [];
  const stepX = values.length > 1 ? chartWidth / (values.length - 1) : 0;
  const xFor = (index: number) =>
    left + (values.length > 1 ? index * stepX : chartWidth / 2);
  const yFor = (value: number) =>
    top + chartHeight * (1 - Math.max(0, Math.min(100, value)) / 100);
  const linePath = values
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"} ${xFor(index).toFixed(2)} ${yFor(
          point.value,
        ).toFixed(2)}`,
    )
    .join(" ");
  const areaPath = values.length
    ? `${linePath} L ${xFor(values.length - 1).toFixed(2)} ${(
        top + chartHeight
      ).toFixed(2)} L ${xFor(0).toFixed(2)} ${(top + chartHeight).toFixed(2)} Z`
    : "";
  const labelStep = Math.max(1, Math.ceil(values.length / 4));

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={{ height }} onLayout={onLayout}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop
                offset="0"
                stopColor={academicColors.blueBright}
                stopOpacity={0.18}
              />
              <Stop
                offset="1"
                stopColor={academicColors.blueBright}
                stopOpacity={0.01}
              />
            </LinearGradient>
          </Defs>
          {[100, 75, 50, 25, 0].map((tick) => {
            const y = yFor(tick);
            return (
              <G key={tick}>
                <Line
                  x1={left}
                  x2={width - right}
                  y1={y}
                  y2={y}
                  stroke="#E9EFF8"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : "4 5"}
                />
                <SvgText
                  x={0}
                  y={y + 3}
                  fill="#8A97AB"
                  fontSize={9}
                  fontWeight="500"
                >
                  {tick}%
                </SvgText>
              </G>
            );
          })}
          {areaPath ? <Path d={areaPath} fill="url(#trendFill)" /> : null}
          {linePath ? (
            <Path
              d={linePath}
              stroke={academicColors.blueBright}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {values.map((point, index) => (
            <Circle
              key={`${point.label}-${index}`}
              cx={xFor(index)}
              cy={yFor(point.value)}
              r={3.6}
              fill={academicColors.blueBright}
              stroke="#FFFFFF"
              strokeWidth={1.6}
            />
          ))}
          {values.map((point, index) => {
            const show = index % labelStep === 0 || index === values.length - 1;
            if (!show) return null;
            return (
              <SvgText
                key={`label-${point.label}-${index}`}
                x={xFor(index)}
                y={height - 7}
                fill="#8A97AB"
                fontSize={9}
                fontWeight="500"
                textAnchor={
                  index === 0
                    ? "start"
                    : index === values.length - 1
                      ? "end"
                      : "middle"
                }
              >
                {point.label}
              </SvgText>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

const SUBJECT_VISUALS: {
  match: RegExp;
  icon: LucideIcon;
  background: string;
  foreground: string;
}[] = [
  {
    match: /english|language|literacy/i,
    icon: BookOpen,
    background: "#F3E9FF",
    foreground: "#9B51E0",
  },
  {
    match: /math/i,
    icon: Calculator,
    background: "#E7EFFF",
    foreground: "#2F6FE4",
  },
  {
    match: /science|physics|chemistry|biology/i,
    icon: FlaskConical,
    background: "#E2F8EB",
    foreground: "#1F9D55",
  },
  {
    match: /social|history|geography|civic/i,
    icon: Globe2,
    background: "#FFE9DF",
    foreground: "#F26430",
  },
  {
    match: /ict|comput|technolog|information/i,
    icon: Monitor,
    background: "#E4F4FF",
    foreground: "#2185D0",
  },
  {
    match: /religious|rme|moral/i,
    icon: Sparkles,
    background: "#FFF3D6",
    foreground: "#C98912",
  },
  {
    match: /music/i,
    icon: Music,
    background: "#FDE8F4",
    foreground: "#D63A8C",
  },
  {
    match: /art|creative|design/i,
    icon: Palette,
    background: "#FFEFE2",
    foreground: "#E07A23",
  },
  {
    match: /french|twi|ga\b|local language/i,
    icon: Languages,
    background: "#EAF2FF",
    foreground: "#3B74D8",
  },
];

export function subjectVisual(name: string) {
  return (
    SUBJECT_VISUALS.find((entry) => entry.match.test(name)) ?? {
      icon: BookOpen,
      background: "#EDF3FF",
      foreground: "#2F6FE4",
    }
  );
}

export function SubjectBadge({
  name,
  size = 38,
}: {
  name: string;
  size?: number;
}) {
  const visual = subjectVisual(name);
  const Icon = visual.icon;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: visual.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        size={Math.round(size * 0.52)}
        color={visual.foreground}
        strokeWidth={2}
      />
    </View>
  );
}

export function StatBadge({
  tone,
  children,
}: {
  tone: "green" | "amber" | "red";
  children: ReactNode;
}) {
  const palette = {
    green: { ring: "#D8F5E5", fill: academicColors.green },
    amber: { ring: "#FDEECB", fill: academicColors.amber },
    red: { ring: "#F9DEE0", fill: academicColors.red },
  }[tone];
  return (
    <View style={[styles.statBadge, { backgroundColor: palette.ring }]}>
      <View style={[styles.statBadgeInner, { backgroundColor: palette.fill }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringLabel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  statBadgeInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
