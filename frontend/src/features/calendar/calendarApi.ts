import { apiRequest } from '../../shared/api/client'
import type { AcademicCalendarEvent } from '../../shared/api/types'

export type CalendarEventInput = {
  academic_year_id: string
  term_id?: string | null
  class_group_id?: string | null
  title: string
  category: AcademicCalendarEvent['category']
  audience: AcademicCalendarEvent['audience']
  starts_on: string
  ends_on: string
  description?: string | null
}

export function fetchCalendarEvents(token: string, yearId: string, termId?: string) {
  const params = new URLSearchParams({ academic_year_id: yearId })
  if (termId) params.set('term_id', termId)
  return apiRequest<AcademicCalendarEvent[]>(`/academic-calendar/events?${params}`, {}, token)
}

export function createCalendarEvent(token: string, payload: CalendarEventInput) {
  return apiRequest<AcademicCalendarEvent>('/academic-calendar/events', {
    method: 'POST', body: JSON.stringify(payload),
  }, token)
}

export function deleteCalendarEvent(token: string, eventId: string) {
  return apiRequest<void>(`/academic-calendar/events/${eventId}`, { method: 'DELETE' }, token)
}

export function seedCalendarEvents(token: string, yearId: string, termId: string) {
  return apiRequest<{ created: number }>('/academic-calendar/events/seed', {
    method: 'POST', body: JSON.stringify({ academic_year_id: yearId, term_id: termId }),
  }, token)
}
