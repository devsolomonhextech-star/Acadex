import { apiRequest } from '../../shared/api/client'
import type { AssessmentCategory, AssessmentSummary, Gradebook, OnlineExam, OnlineExamCard } from '../../shared/api/types'

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
  submission_status: 'not_recorded' | 'submitted' | 'missing' | 'excused'
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

export type ExamQuestionDraft = { text: string; type: 'multiple_choice' | 'written'; points: string; options?: { text: string; correct: boolean }[] }
export type ExamSetupDraft = { duration_minutes: number; instructions: string | null; opens_at: string | null; closes_at: string | null; questions: ExamQuestionDraft[] }

export function fetchOnlineExam(token: string, assessmentId: string) {
  return apiRequest<OnlineExam>(`/exams/assessment/${assessmentId}`, {}, token)
}
export function saveOnlineExam(token: string, assessmentId: string, payload: ExamSetupDraft) {
  return apiRequest<OnlineExam>(`/exams/assessment/${assessmentId}`, { method: 'PUT', body: JSON.stringify(payload) }, token)
}
export function toggleOnlineExam(token: string, assessmentId: string) {
  return apiRequest<{ published: boolean }>(`/exams/assessment/${assessmentId}/publish`, { method: 'POST' }, token)
}
export type ExamAttempt = {
  id: string; student_id: string; student_name: string; admission_number: string; status: string
  started_at: string; submitted_at: string | null; score: string | null
  answers: { question_id: string; question: string; type: 'multiple_choice' | 'written'; max_points: string; written_answer: string | null; selected_option: string | null; points_awarded: string | null; feedback: string | null }[]
}
export function fetchExamAttempts(token: string, assessmentId: string) {
  return apiRequest<{ assessment_id: string; exam_id: string; attempts: ExamAttempt[] }>(`/exams/assessment/${assessmentId}/attempts`, {}, token)
}
export function markExamAttempt(token: string, attemptId: string, marks: { question_id: string; points_awarded: string; feedback?: string | null }[]) {
  return apiRequest<{ status: string; score: string }>(`/exams/attempt/${attemptId}/review`, { method: 'POST', body: JSON.stringify({ marks }) }, token)
}
export function fetchStudentExams(token: string) {
  return apiRequest<OnlineExamCard[]>('/exams/student/available', {}, token)
}
export function startStudentExam(token: string, examId: string) {
  return apiRequest<{ attempt_id: string; deadline_at: string; exam: OnlineExam }>(`/exams/student/${examId}/start`, { method: 'POST' }, token)
}
export function saveStudentAnswers(token: string, attemptId: string, answers: { question_id: string; selected_option_id: string | null; written_answer: string | null }[]) {
  return apiRequest<{ saved: boolean }>(`/exams/student/attempt/${attemptId}/answers`, { method: 'PUT', body: JSON.stringify({ answers }) }, token)
}
export function submitStudentExam(token: string, attemptId: string, answers: { question_id: string; selected_option_id: string | null; written_answer: string | null }[]) {
  return apiRequest<{ status: string; score: string | null; awaiting_teacher_review: boolean }>(`/exams/student/attempt/${attemptId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }, token)
}
export function fetchStudentExamAttempt(token: string, attemptId: string) {
  return apiRequest<{ attempt_id: string; deadline_at: string; status: string; exam: OnlineExam; answers: { question_id: string; selected_option_id: string | null; written_answer: string | null }[] }>(`/exams/student/attempt/${attemptId}`, {}, token)
}
