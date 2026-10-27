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
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export async function registerPushToken(): Promise<void> {
  if (!Device.isDevice || (Platform.OS !== "ios" && Platform.OS !== "android"))
    return;
  const permissions = await Notifications.getPermissionsAsync();
  const finalStatus = permissions.granted
    ? permissions.status
    : (await Notifications.requestPermissionsAsync()).status;
  if (finalStatus !== "granted") return;
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
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
