import { apiRequest } from '../../shared/api/client'
import type { TimetableSlot } from '../../shared/api/types'

export function fetchTimetable(token: string, yearId: string, classGroupId?: string) {
  const params = new URLSearchParams({ academic_year_id: yearId })
  if (classGroupId) params.set('class_group_id', classGroupId)
  return apiRequest<TimetableSlot[]>(`/timetable?${params.toString()}`, {}, token)
}

export type SlotInput = {
  academic_year_id: string
  class_group_id: string
  subject_id: string
  teacher_membership_id: string
  day_of_week: number
  starts_at: string
  ends_at: string
  room?: string | null
}

export function createTimetableSlot(token: string, payload: SlotInput) {
  return apiRequest<TimetableSlot>('/timetable', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchTodayTimetable(token: string) {
  return apiRequest<TimetableSlot[]>('/timetable/today', {}, token)
}

export function deleteTimetableSlot(token: string, slotId: string) {
  return apiRequest<void>(`/timetable/${slotId}`, { method: 'DELETE' }, token)
}
