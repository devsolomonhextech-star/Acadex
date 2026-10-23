import { apiRequest } from '../../shared/api/client'
import type { AttendanceSheet, AttendanceStatus } from '../../shared/api/types'

export function fetchAttendanceSheet(token: string, classGroupId: string, attendanceDate: string) {
  const query = new URLSearchParams({ class_group_id: classGroupId, attendance_date: attendanceDate })
  return apiRequest<AttendanceSheet>(`/attendance/sheet?${query.toString()}`, {}, token)
}

export function saveAttendanceSheet(token: string, payload: {
  class_group_id: string; attendance_date: string
  marks: { student_id: string; status: Exclude<AttendanceStatus, 'unmarked'>; note: string | null }[]
}) {
  return apiRequest<AttendanceSheet>('/attendance/sheet', { method: 'PUT', body: JSON.stringify(payload) }, token)
}
