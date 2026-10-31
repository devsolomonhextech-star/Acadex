import { api } from "../api/client";

export type ParentNotificationPreferences = {
  attendance: boolean;
  announcements: boolean;
  fees: boolean;
  reports: boolean;
  parent_desk: boolean;
};

export const accountApi = {
  notificationPreferences: async (signal?: AbortSignal) =>
    (await api.get<ParentNotificationPreferences>("/mobile/notification-preferences", { signal })).data,
  saveNotificationPreferences: async (preferences: ParentNotificationPreferences) =>
    (await api.put<ParentNotificationPreferences>("/mobile/notification-preferences", preferences)).data,
  changePassword: async (current_password: string, new_password: string) =>
    api.post("/mobile/password/change", { current_password, new_password }),
};
