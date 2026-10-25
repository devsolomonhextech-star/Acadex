import { apiRequest } from '../../shared/api/client'
import type { StudentSupportSummary, SupportAssignee, SupportIntervention } from '../../shared/api/types'

export function fetchStudentSupport(token: string, yearId?: string, termId?: string) {
  const query = new URLSearchParams()
  if (yearId) query.set('academic_year_id', yearId)
  if (termId) query.set('term_id', termId)
  return apiRequest<StudentSupportSummary>(`/student-support${query.size ? `?${query}` : ''}`, {}, token)
}

export function fetchSupportInterventions(token: string, yearId: string, termId?: string) {
  const query = new URLSearchParams({ academic_year_id: yearId })
  if (termId) query.set('term_id', termId)
  return apiRequest<SupportIntervention[]>(`/student-support/interventions?${query}`, {}, token)
}

export function fetchSupportAssignees(token: string) {
  return apiRequest<SupportAssignee[]>('/student-support/assignees', {}, token)
}

export function inviteSupportStaff(token: string, payload: { email: string; display_name: string }) {
  return apiRequest<{ id: string; email: string; role: string; expires_at: string; invite_token: string }>(
    '/staff/invitations/support-staff', { method: 'POST', body: JSON.stringify(payload) }, token,
  )
}

export function createSupportIntervention(token: string, payload: {
  student_id: string; academic_year_id: string; term_id: string | null
  category: string; title: string; action: string; assigned_to_membership_id: string | null; follow_up_on: string | null
}) {
  return apiRequest<SupportIntervention>('/student-support/interventions', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function updateSupportIntervention(token: string, id: string, payload: {
  status?: string; assigned_to_membership_id?: string | null; follow_up_on?: string | null; outcome?: string | null
}) {
  return apiRequest<SupportIntervention>(`/student-support/interventions/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }, token)
}
