import { apiRequest } from '../../shared/api/client'
import type { Announcement } from '../../shared/api/types'

export interface AnnouncementCreatePayload {
  title: string
  body: string
  audience: string
  class_group_id?: string | null
  expires_at?: string | null
}

export function createAnnouncement(token: string, payload: AnnouncementCreatePayload) {
  return apiRequest<Announcement>(
    '/announcements', { method: 'POST', body: JSON.stringify(payload) }, token,
  )
}

export function fetchAnnouncements(token: string) {
  return apiRequest<Announcement[]>('/announcements', {}, token)
}
