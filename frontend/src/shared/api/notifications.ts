import { apiRequest } from './client'
import type { Notification } from './types'

export function fetchNotifications(token: string) {
  return apiRequest<Notification[]>('/notifications', {}, token)
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' }, token)
}
