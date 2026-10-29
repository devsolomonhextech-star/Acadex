import { Tabs } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ParentTabBar } from "../../../src/components/ParentTabBar";
import { communicationsApi } from "../../../src/features/communicationsApi";
export default function ParentTabs() {
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: ({ signal }) => communicationsApi.notifications(signal),
  });
  const unread =
    notifications.data?.filter((item) => !item.read_at).length ?? 0;
  return (
    <Tabs
      tabBar={(props) => <ParentTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: "#F4F8FD" },
      }}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="parent-desk" options={{ title: "Parent Desk" }} />
      <Tabs.Screen name="academics" options={{ title: "Academics" }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Updates",
          tabBarBadge: unread ? unread : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
