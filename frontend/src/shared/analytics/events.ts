import { analyticsClient } from './client.ts'
import { bucketSupportVolume } from './contract.ts'

/**
 * The four early-support events Acadex reports, called from the real handlers in
 * `features/student-support/StudentSupportPage.tsx`. Properties are coarse
 * product facts only: no student id, name, admission number, class, contact
 * detail or free text is passed, and the client allowlist drops anything extra.
 */

export type SupportReviewLevel = 'urgent_review' | 'follow_up' | 'monitor' | 'no_current_signal'
export type SupportArea = 'attendance' | 'academic' | 'assignment' | 'wellbeing' | 'family_contact' | 'other'
export type SupportFollowUpStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled'

export function trackSupportQueueViewed(input: {
  staffRole: string
  termScope: 'term' | 'academic_year'
  studentsWithSignals: number
}): boolean {
  return analyticsClient.capture('support_queue_viewed', {
    surface: 'student_support_queue',
    staff_role: input.staffRole,
    term_scope: input.termScope,
    students_with_signals_bucket: bucketSupportVolume(input.studentsWithSignals),
  })
}

export function trackSupportReviewOpened(input: {
  staffRole: string
  supportLevel: SupportReviewLevel
  signalCount: number
  hasRecommendations: boolean
}): boolean {
  return analyticsClient.capture('support_review_opened', {
    staff_role: input.staffRole,
    support_level: input.supportLevel,
    signal_count: input.signalCount,
    has_recommendations: input.hasRecommendations,
  })
}

export function trackSupportActionCreated(input: {
  staffRole: string
  supportArea: SupportArea
  assignedOwner: boolean
  hasFollowUpDate: boolean
  fromSuggestion: boolean
}): boolean {
  return analyticsClient.capture('support_action_created', {
    staff_role: input.staffRole,
    support_area: input.supportArea,
    assigned_owner: input.assignedOwner,
    has_follow_up_date: input.hasFollowUpDate,
    from_suggestion: input.fromSuggestion,
  })
}

export function trackSupportFollowUpUpdated(input: {
  staffRole: string
  status: SupportFollowUpStatus
  hasOutcome: boolean
  hasFollowUpDate: boolean
}): boolean {
  return analyticsClient.capture('support_followup_updated', {
    staff_role: input.staffRole,
    status: input.status,
    has_outcome: input.hasOutcome,
    has_follow_up_date: input.hasFollowUpDate,
  })
}
