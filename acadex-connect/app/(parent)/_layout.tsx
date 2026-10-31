import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useAuth } from "../../src/services/auth";
import { colors } from "../../src/theme/tokens";
import { ParentDataProvider } from "../../src/services/parentData";
import { registerPushToken } from "../../src/services/pushNotifications";
import { OfflineBanner } from "../../src/components/ui";
import { ParentAppTour } from "../../src/components/ParentAppTour";
import { notificationRoute } from "../../src/lib/notificationRoutes";
import { api } from "../../src/api/client";
export default function ParentLayout() {
  const { parent, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!parent) return;
    void registerPushToken().catch(() => undefined);
    const handledResponses = new Set<string>();
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const responseId = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.has(responseId)) return;
      handledResponses.add(responseId);
      const route = notificationRoute(
        response.notification.request.content.data?.link,
      );
      if (route) router.push(route);
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(
      handleResponse,
    );
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void registerPushToken().catch(() => undefined);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });
    return () => {
      subscription.remove();
      tokenSubscription.remove();
    };
  }, [parent, router]);
  useEffect(() => {
    if (!parent) return;
    let active = true;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const connect = async () => {
      try {
        const { data } = await api.post<{ ticket: string }>("/realtime/ticket");
        if (!active) return;
        const apiUrl = new URL(api.defaults.baseURL ?? "http://localhost:8001/api/v1");
        apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
        apiUrl.pathname = `${apiUrl.pathname.replace(/\/$/, "")}/realtime/ws`;
        apiUrl.search = new URLSearchParams({ ticket: data.ticket }).toString();
        socket = new WebSocket(apiUrl.toString());
        socket.onopen = () => { attempt = 0; };
        socket.onmessage = () => {
          void queryClient.invalidateQueries({ queryKey: ["notifications"] });
          void queryClient.invalidateQueries({ queryKey: ["family-requests"] });
          void queryClient.invalidateQueries({ queryKey: ["announcements"] });
        };
        socket.onclose = () => {
          if (active) timer = setTimeout(() => { void connect(); }, Math.min(1000 * 2 ** attempt++, 30_000));
        };
      } catch {
        if (active) timer = setTimeout(() => { void connect(); }, Math.min(1000 * 2 ** attempt++, 30_000));
      }
    };
    void connect();
    return () => { active = false; if (timer) clearTimeout(timer); socket?.close(); };
  }, [parent, queryClient]);
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
