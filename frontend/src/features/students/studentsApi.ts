import { apiRequest, apiRequestBlob } from '../../shared/api/client'
import type {
  ImportHistoryPage, ImportJobDetail, ImportJobSummary, Student, StudentPage,
  StudentProfile,
} from '../../shared/api/types'

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

export function fetchStudentProfile(token: string, studentId: string) {
  return apiRequest<StudentProfile>(`/students/${studentId}/profile`, {}, token)
}

export function createStudent(token: string, payload: NewStudent) {
  return apiRequest<Student>('/students', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function uploadImportPreview(token: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<ImportJobDetail>('/student-imports/preview', { method: 'POST', body: form }, token)
}

export function confirmImport(token: string, jobId: string) {
  return apiRequest<ImportJobDetail>(`/student-imports/${jobId}/confirm`, { method: 'POST' }, token)
}

export function fetchImportHistory(token: string, page: number) {
  return apiRequest<ImportHistoryPage>(`/student-imports?page=${page}&page_size=10`, {}, token)
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export async function downloadImportTemplate(token: string, format: 'csv' | 'xlsx') {
  const blob = await apiRequestBlob(`/student-imports/template?format=${format}`, token)
  saveBlob(blob, `student-import-template.${format}`)
}

export async function downloadImportErrors(token: string, job: ImportJobSummary) {
  const blob = await apiRequestBlob(`/student-imports/${job.id}/errors.csv`, token)
  const stem = job.filename.replace(/\.[^.]+$/, '')
  saveBlob(blob, `${stem}-errors.csv`)
}
