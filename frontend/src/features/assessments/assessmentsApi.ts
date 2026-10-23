import { apiRequest } from '../../shared/api/client'
import type { AssessmentCategory, AssessmentSummary, Gradebook } from '../../shared/api/types'

export function fetchAssessments(token: string, yearId: string) {
  const query = new URLSearchParams({ academic_year_id: yearId })
  return apiRequest<AssessmentSummary[]>(`/assessments?${query.toString()}`, {}, token)
}

export function createAssessment(token: string, payload: {
  class_group_id: string; subject_id: string; term_id: string; title: string
  category: AssessmentCategory; max_score: string; weight_percent: string; due_on: string | null
}) {
  return apiRequest<AssessmentSummary>('/assessments', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchGradebook(token: string, assessmentId: string) {
  return apiRequest<Gradebook>(`/assessments/${assessmentId}/gradebook`, {}, token)
}

export function saveGradebook(token: string, assessmentId: string, marks: {
  student_id: string; score: string | null; comment: string | null
}[]) {
  return apiRequest<Gradebook>(`/assessments/${assessmentId}/gradebook`, {
    method: 'PUT', body: JSON.stringify({ marks }),
  }, token)
}

export function submitAssessment(token: string, assessmentId: string) {
  return apiRequest<AssessmentSummary>(`/assessments/${assessmentId}/submit`, { method: 'POST' }, token)
}

export function reviewAssessment(token: string, assessmentId: string, decision: 'approve' | 'return', note?: string) {
  return apiRequest<AssessmentSummary>(`/assessments/${assessmentId}/review`, {
    method: 'POST', body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
  }, token)
}
