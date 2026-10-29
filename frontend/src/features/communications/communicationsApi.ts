import { apiRequest } from '../../shared/api/client'
import type { Announcement, NoticeAudience, SchoolNotice } from '../../shared/api/types'

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

export interface NoticePayload {
  title: string
  body: string
  audience: NoticeAudience
  class_group_id?: string | null
  student_id?: string | null
}

export function fetchSentNotices(token: string, limit = 20) {
  return apiRequest<SchoolNotice[]>(`/communications/notifications?limit=${limit}`, {}, token)
}

export function fetchNoticePreview(
  token: string,
  params: { audience: NoticeAudience; classGroupId?: string; studentId?: string },
) {
  const query = new URLSearchParams({ audience: params.audience })
  if (params.audience === 'class' && params.classGroupId) query.set('class_group_id', params.classGroupId)
  if (params.audience === 'student' && params.studentId) query.set('student_id', params.studentId)
  return apiRequest<{ recipients: number }>(
    `/communications/notifications/preview?${query}`, {}, token,
  )
}

export function sendNotice(token: string, payload: NoticePayload) {
  return apiRequest<SchoolNotice>(
    '/communications/notifications',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  )
}
