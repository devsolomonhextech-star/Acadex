import { apiRequest } from '../../shared/api/client'
import type { Subject, Teacher, TeachingAssignment } from '../../shared/api/types'

export function fetchSubjects(token: string) {
  return apiRequest<Subject[]>('/academic/subjects', {}, token)
}

export function createSubject(token: string, payload: { code: string; name: string }) {
  return apiRequest<Subject>('/academic/subjects', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchTeachers(token: string) {
  return apiRequest<Teacher[]>('/academic/teachers', {}, token)
}

export function fetchTeachingAssignments(token: string, yearId: string) {
  return apiRequest<TeachingAssignment[]>(`/academic/teaching-assignments?academic_year_id=${encodeURIComponent(yearId)}`, {}, token)
}

export function createTeachingAssignment(token: string, payload: Pick<TeachingAssignment, 'class_group_id' | 'subject_id' | 'teacher_membership_id'>) {
  return apiRequest<TeachingAssignment>('/academic/teaching-assignments', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function inviteTeacher(token: string, payload: { email: string; display_name: string }) {
  return apiRequest<{ id: string; email: string; role: string; expires_at: string; invite_token: string }>(
    '/staff/invitations/teachers', { method: 'POST', body: JSON.stringify(payload) }, token,
  )
}

export function acceptTeacherInvitation(payload: { token: string; password?: string }) {
  return apiRequest<{ email: string; school_name: string; school_slug: string; role: string; message: string }>(
    '/staff/invitations/accept', { method: 'POST', body: JSON.stringify(payload) },
  )
}

