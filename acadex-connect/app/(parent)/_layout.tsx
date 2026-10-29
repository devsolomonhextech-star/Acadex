import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useAuth } from "../../src/services/auth";
import { colors } from "../../src/theme/tokens";
import { ParentDataProvider } from "../../src/services/parentData";
import { registerPushToken } from "../../src/services/pushNotifications";
import { OfflineBanner } from "../../src/components/ui";
import { ParentAppTour } from "../../src/components/ParentAppTour";
import { notificationRoute } from "../../src/lib/notificationRoutes";
export default function ParentLayout() {
  const { parent, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!parent) return;
    void registerPushToken().catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const route = notificationRoute(
          response.notification.request.content.data?.link,
        );
        if (route) router.push(route);
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
        <Stack.Screen
          name="children"
          options={{ title: "My Children", headerBackTitle: "Back" }}
        />
        <Stack.Screen name="attendance" options={{ headerShown: false }} />
        <Stack.Screen name="fees" options={{ headerShown: false }} />
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
      <ParentAppTour />
    </ParentDataProvider>
  );
}
