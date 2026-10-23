import { apiRequest } from '../../shared/api/client'
import type { Student, StudentPage } from '../../shared/api/types'

type NewStudent = { admission_number: string; first_name: string; last_name: string; date_of_birth?: string }

export function fetchStudents(token: string, page: number, search: string, status?: string) {
  const params = new URLSearchParams({ page: String(page), page_size: '10' })
  if (search.trim()) params.set('search', search.trim())
  if (status) params.set('status', status)
  return apiRequest<StudentPage>(`/students?${params}`, {}, token)
}

export function fetchStudentOptions(token: string) {
  return apiRequest<StudentPage>('/students?page=1&page_size=100', {}, token)
}

export function createStudent(token: string, payload: NewStudent) {
  return apiRequest<Student>('/students', { method: 'POST', body: JSON.stringify(payload) }, token)
}
