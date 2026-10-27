import { api } from "../api/client";
import type { Announcement, Notification } from "../types/models";

export const communicationsApi = {
  announcements: async (signal?: AbortSignal) =>
    (await api.get<Announcement[]>("/announcements", { signal })).data,
  notifications: async (signal?: AbortSignal) =>
    (await api.get<Notification[]>("/notifications", { signal })).data,
  markRead: async (id: string) => api.post(`/notifications/${id}/read`),
};
