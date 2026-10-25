import { apiRequest } from '../../shared/api/client'
import type { Student, Announcement, Notification } from '../../shared/api/types'

export function fetchMyChildren(token: string) {
  return apiRequest<Student[]>('/family/children', {}, token)
}

export function fetchAnnouncements(token: string) {
  return apiRequest<Announcement[]>('/announcements', {}, token)
}

export function fetchNotifications(token: string) {
  return apiRequest<Notification[]>('/notifications', {}, token)
}

export function markNotificationRead(token: string, id: string) {
  return apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' }, token)
}

export function fetchChildResults(token: string, studentId: string) {
  return apiRequest<unknown>(`/family/results/${studentId}`, {}, token)
}
