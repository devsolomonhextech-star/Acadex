import { apiRequest } from '../../shared/api/client'
import type { Student, Announcement, ParentReportCardTerm, ReportCard } from '../../shared/api/types'
export { fetchNotifications, markNotificationRead } from '../../shared/api/notifications'

export function fetchMyChildren(token: string) {
  return apiRequest<Student[]>('/family/children', {}, token)
}

export function fetchAnnouncements(token: string) {
  return apiRequest<Announcement[]>('/announcements', {}, token)
}

export function fetchChildResults(token: string, studentId: string) {
  return apiRequest<unknown>(`/family/results/${studentId}`, {}, token)
}

export function fetchChildReportCards(token: string, studentId: string) {
  return apiRequest<ParentReportCardTerm[]>(`/family/report-cards/${studentId}`, {}, token)
}

export function fetchChildReportCard(token: string, studentId: string, termId: string) {
  return apiRequest<ReportCard>(`/family/report-cards/${studentId}/${termId}`, {}, token)
}
