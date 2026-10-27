import { Redirect, Stack, useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../../src/services/auth";
import { colors } from "../../src/theme/tokens";
import { ParentDataProvider } from "../../src/services/parentData";
import { registerPushToken } from "../../src/services/pushNotifications";
import { OfflineBanner } from "../../src/components/ui";
export default function ParentLayout() {
  const { parent, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!parent) return;
    void registerPushToken().catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const link = response.notification.request.content.data?.link;
        const destinations: Record<string, Href> = {
          "/attendance": "/(parent)/attendance",
          "/fees": "/(parent)/fees",
          "/timetable": "/(parent)/timetable",
          "/announcements": "/(parent)/announcements",
          "/academics": "/(parent)/(tabs)/academics",
          "/notifications": "/(parent)/(tabs)/notifications",
          "/children": "/(parent)/(tabs)/children",
        };
        if (typeof link === "string" && destinations[link])
          router.push(destinations[link]);
      },
    );
    return () => subscription.remove();
  }, [parent, router]);
  if (loading) return null;
  if (!parent || parent.role !== "parent")
    return <Redirect href="/(auth)/login" />;
  return (
    <ParentDataProvider>
      <OfflineBanner />
      <Stack
        screenOptions={{
          headerShown: true,
          headerTintColor: colors.blue,
          headerTitleStyle: { color: colors.ink, fontWeight: "700" },
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="attendance" options={{ title: "Attendance" }} />
        <Stack.Screen name="fees" options={{ title: "Fees & payments" }} />
        <Stack.Screen name="timetable" options={{ title: "Class timetable" }} />
        <Stack.Screen
          name="announcements"
          options={{ title: "School updates" }}
        />
        <Stack.Screen
          name="report-cards/[studentId]/[termId]"
          options={{ title: "Term report" }}
        />
      </Stack>
    </ParentDataProvider>
  );
}
