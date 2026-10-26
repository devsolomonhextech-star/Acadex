import { apiRequest } from '../../shared/api/client'
import type { AcademicTerm, AcademicYear, ClassGroup, ClassRosterStudent, Enrollment } from '../../shared/api/types'

export function fetchAcademicYears(token: string) {
  return apiRequest<AcademicYear[]>('/academic/years', {}, token)
}

export function createAcademicYear(token: string, payload: Omit<AcademicYear, 'id' | 'status'>) {
  return apiRequest<AcademicYear>('/academic/years', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchAcademicTerms(token: string, yearId: string) {
  return apiRequest<AcademicTerm[]>(`/academic/terms?academic_year_id=${encodeURIComponent(yearId)}`, {}, token)
}

export function createAcademicTerm(token: string, payload: Omit<AcademicTerm, 'id'>) {
  return apiRequest<AcademicTerm>('/academic/terms', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchClassGroups(token: string, yearId: string) {
  return apiRequest<ClassGroup[]>(`/academic/classes?academic_year_id=${encodeURIComponent(yearId)}`, {}, token)
}

export function createClassGroup(token: string, payload: Omit<ClassGroup, 'id'>) {
  return apiRequest<ClassGroup>('/academic/classes', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchClassEnrollments(token: string, classId: string) {
  return apiRequest<Enrollment[]>(`/academic/classes/${classId}/enrollments`, {}, token)
}

export function fetchClassRoster(token: string, classId: string) {
  return apiRequest<ClassRosterStudent[]>(`/academic/classes/${encodeURIComponent(classId)}/roster`, {}, token)
}

export function createEnrollment(token: string, payload: Omit<Enrollment, 'id' | 'status'>) {
  return apiRequest<Enrollment>('/academic/enrollments', { method: 'POST', body: JSON.stringify(payload) }, token)
}
