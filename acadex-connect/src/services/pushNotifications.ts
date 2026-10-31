import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { api } from "../api/client";

const TOKEN_KEY = "acadex-connect.expo-push-token";
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android"))
    return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("school-updates", {
      name: "School updates",
      description: "Attendance alerts, school announcements and Parent Desk replies",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      sound: "default",
      enableVibrate: true,
      showBadge: true,
    });
  }
  const permissions = await Notifications.getPermissionsAsync();
  const finalStatus = permissions.granted
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return;
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) {
    if (__DEV__) {
      console.warn(
        "Push notifications need an EAS project ID. Set expo.extra.eas.projectId or EXPO_PUBLIC_EAS_PROJECT_ID.",
      );
    }
    return;
  }
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.put("/mobile/push-token", { token, platform: Platform.OS });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function unregisterPushToken(): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  const platform = Platform.OS === "ios" ? "ios" : "android";
  await api.delete("/mobile/push-token", { data: { token, platform } });
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
