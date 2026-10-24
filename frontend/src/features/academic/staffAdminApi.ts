import { apiRequest } from '../../shared/api/client'
import type { AdminTeacher } from '../../shared/api/types'

export function fetchAdminTeachers(token: string) {
  return apiRequest<AdminTeacher[]>('/staff/teachers', {}, token)
}

export function createTeacherAccount(token: string, payload: { display_name: string; email: string; password: string }) {
  return apiRequest<AdminTeacher>('/staff/teachers', { method: 'POST', body: JSON.stringify(payload) }, token)
}
