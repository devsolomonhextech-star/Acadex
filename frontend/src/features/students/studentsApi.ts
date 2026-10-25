import { apiRequest, apiRequestBlob } from '../../shared/api/client'
import type {
  ImportHistoryPage, ImportJobDetail, ImportJobSummary, MessageResult,
  PasswordResetResult, ProfileBehavior, ProfileDocument, ProfileStudentInfo,
  Student, StudentPage, StudentProfile,
} from '../../shared/api/types'

type NewStudent = { admission_number: string; first_name: string; last_name: string; date_of_birth?: string }

export type StudentEdit = {
  first_name?: string
  last_name?: string
  date_of_birth?: string | null
  gender?: 'male' | 'female' | 'other' | null
  phone?: string | null
  email?: string | null
  status?: 'active' | 'transferred' | 'graduated' | 'withdrawn'
}

export type BehaviorInput = {
  occurred_on: string
  category: 'merit' | 'demerit' | 'incident' | 'note'
  severity?: 'low' | 'medium' | 'high'
  title: string
  description?: string | null
  action_taken?: string | null
}

export type DocumentInput = {
  doc_type: 'id_card' | 'birth_certificate' | 'previous_report' | 'medical' | 'consent' | 'other'
  title: string
  reference?: string | null
  issued_on?: string | null
  notes?: string | null
}

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

export function updateStudent(token: string, studentId: string, payload: StudentEdit) {
  return apiRequest<ProfileStudentInfo>(`/students/${studentId}`,
    { method: 'PATCH', body: JSON.stringify(payload) }, token)
}

export function setStudentPassword(
  token: string, studentId: string, payload: { current_password?: string; new_password: string },
) {
  return apiRequest<PasswordResetResult>(`/students/${studentId}/password`,
    { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function recordBehavior(token: string, studentId: string, payload: BehaviorInput) {
  return apiRequest<ProfileBehavior>(`/students/${studentId}/behavior`,
    { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function removeBehavior(token: string, studentId: string, recordId: string) {
  return apiRequest<void>(`/students/${studentId}/behavior/${recordId}`, { method: 'DELETE' }, token)
}

export function fileStudentDocument(token: string, studentId: string, payload: DocumentInput) {
  return apiRequest<ProfileDocument>(`/students/${studentId}/documents`,
    { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function removeStudentDocument(token: string, studentId: string, recordId: string) {
  return apiRequest<void>(`/students/${studentId}/documents/${recordId}`, { method: 'DELETE' }, token)
}

export function messageStudentGuardians(
  token: string, studentId: string, payload: { title: string; body: string },
) {
  return apiRequest<MessageResult>(`/students/${studentId}/message`,
    { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function updateGuardian(
  token: string, guardianId: string,
  payload: { first_name?: string; last_name?: string; email?: string | null; phone?: string | null; relationship?: string | null },
) {
  return apiRequest<{ guardian_id: string; student_id: string }>(`/guardians/${guardianId}`,
    { method: 'PATCH', body: JSON.stringify(payload) }, token)
}
