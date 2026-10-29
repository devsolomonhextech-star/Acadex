import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  Bell,
  BookOpen,
  House,
  Inbox,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors } from "../theme/tokens";

type TabBarProps = {
  state: {
    index: number;
    routes: { key: string; name: string; params?: object }[];
  };
  descriptors: Record<string, { options: { tabBarBadge?: number | string } }>;
  navigateToTab: (routeKey: string) => void;
  insets: { bottom: number };
};

const TABS: {
  name: string;
  label: string;
  icon: LucideIcon;
}[] = [
  { name: "home", label: "Home", icon: House },
  { name: "parent-desk", label: "Parent Desk", icon: Inbox },
  { name: "academics", label: "Academics", icon: BookOpen },
  { name: "notifications", label: "Updates", icon: Bell },
  { name: "profile", label: "Profile", icon: UserRound },
];

export function ParentTabBar({
  state,
  descriptors,
  navigateToTab,
  insets,
}: TabBarProps) {
  const [width, setWidth] = useState(0);
  const routes = TABS.map((tab) =>
    state.routes.find((route) => route.name === tab.name),
  ).filter((route): route is NonNullable<typeof route> => Boolean(route));
  const activeKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(
    0,
    routes.findIndex((route) => route.key === activeKey),
  );
  const itemWidth = routes.length ? width / routes.length : 0;
  const translate = useSharedValue(0);

  useEffect(() => {
    if (!itemWidth) return;
    translate.value = withSpring(activeIndex * itemWidth, {
      damping: 20,
      stiffness: 180,
      mass: 0.8,
    });
  }, [activeIndex, itemWidth, translate]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translate.value }],
  }));

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 6 }]}>
      <View
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.bar}
      >
        {itemWidth > 0 ? (
          <Animated.View
            style={[styles.activePill, { width: itemWidth - 8 }, pillStyle]}
          />
        ) : null}
        {routes.map((route) => {
          const tab = TABS.find((item) => item.name === route.name) ?? TABS[0];
          const Icon = tab.icon;
          const active = route.key === activeKey;
          const badge = descriptors[route.key]?.options.tabBarBadge;
          return (
            <TabItem
              key={route.key}
              icon={Icon}
              label={tab.label}
              active={active}
              badge={badge}
              onPress={() => navigateToTab(route.key)}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  icon: Icon,
  label,
  active,
  badge,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: string | number;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(active ? 1.08 : 1, {
      damping: 14,
      stiffness: 220,
    });
  }, [active, scale]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.tab}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <Icon
          size={20}
          color={active ? colors.blue : colors.muted}
          strokeWidth={active ? 2.4 : 1.9}
        />
        {badge !== undefined && badge !== null && badge !== "" ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {typeof badge === "number" && badge > 9 ? "9+" : badge}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        style={[styles.label, active && styles.labelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#F4F8FD",
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  bar: {
    height: 62,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E5ECF7",
    backgroundColor: "#FFFFFF",
    shadowColor: "#173C74",
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  activePill: {
    position: "absolute",
    top: 5,
    bottom: 5,
    left: 4,
    borderRadius: 19,
    backgroundColor: colors.blueSoft,
  },
  tab: {
    flex: 1,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    zIndex: 1,
  },
  iconWrap: {
    width: 28,
    height: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    color: colors.muted,
    fontSize: 8.7,
    fontWeight: "600",
  },
  labelActive: {
    color: colors.blue,
    fontWeight: "800",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -9,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: "#F04444",
    borderWidth: 1,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 8.5,
    fontWeight: "800",
  },
});
