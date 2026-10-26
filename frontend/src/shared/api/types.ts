export type Session = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  csrf_token: string
}
export type LoginResult = (Session & { requires_two_factor?: false }) | { requires_two_factor: true; challenge_token: string }

export type SchoolUser = {
  user_id: string
  school_id: string
  school_name: string
  school_slug: string
  display_name: string
  email: string
  role: string
}

export type Student = {
  id: string
  admission_number: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  status: 'active' | 'transferred' | 'graduated' | 'withdrawn'
  class_name?: string | null
  guardian_name?: string | null
  guardian_contact?: string | null
}

export type StudentPage = { items: Student[]; page: number; page_size: number; total: number }
export type ProfileGuardian = {
  guardian_id: string; full_name: string; relationship: string
  email: string | null; phone: string | null; is_primary: boolean
  has_portal_login: boolean
}
export type ProfileStudentInfo = {
  id: string; admission_number: string; first_name: string; last_name: string
  display_name: string; date_of_birth: string | null; age_years: number | null
  gender: string | null; phone: string | null; email: string | null
  status: string; has_portal_login: boolean
}
export type ProfileSubject = {
  subject_code: string; subject_name: string; teacher_name: string | null
}
export type ProfileLesson = {
  starts_at: string; ends_at: string; subject_code: string
  subject_name: string; teacher_name: string; room: string | null
}
export type ProfileWeekdayLesson = ProfileLesson & { day_of_week: number; day_name: string }
export type ProfileBehavior = {
  id: string; occurred_on: string; category: string; severity: string
  title: string; description: string | null; action_taken: string | null; recorded_by: string
}
export type ProfileDocument = {
  id: string; doc_type: string; title: string; reference: string | null
  issued_on: string | null; notes: string | null; created_at: string; added_by: string
}
export type ProfileActivity = {
  key: string; kind: 'attendance' | 'payment' | 'result' | 'behavior' | 'document'
  title: string; detail: string; at: string; day: string
}
export type PasswordResetResult = { email: string; created_account: boolean }
export type MessageResult = { recipients: number; guardian_names: string[] }
export type StudentProfile = {
  generated_at: string
  student: ProfileStudentInfo
  enrollment: {
    class_group_id: string; class_name: string; grade_level: string
    stream: string; academic_year: string; enrolled_on: string
  } | null
  guardians: ProfileGuardian[]
  attendance: {
    present: number; absent: number; late: number; excused: number
    days_marked: number; rate_percent: number | null
    recent: { day: string; status: string }[]
  } | null
  finance: {
    invoiced_total: string; paid_total: string; outstanding_total: string
    payments: {
      id: string; receipt_number: string; amount: string; method: string
      reference: string | null; payment_date: string
      allocated_amount: string; unallocated_amount: string
    }[]
    invoices: {
      id: string; invoice_number: string; term_name: string; total_amount: string
      paid_amount: string; balance: string; status: string; issued_on: string
    }[]
  } | null
  results: {
    term_id: string; term_name: string; academic_year: string; ordinal: number
    aggregate_percent: string; grade: string | null; position: number | null; published: boolean
  }[]
  subjects: ProfileSubject[]
  schedule_today: ProfileLesson[]
  schedule: ProfileWeekdayLesson[]
  behavior: ProfileBehavior[]
  documents: ProfileDocument[]
  activities: ProfileActivity[]
}
export type AcademicYear = { id: string; name: string; starts_on: string; ends_on: string; status: string }
export type AcademicTerm = { id: string; academic_year_id: string; name: string; ordinal: number; starts_on: string; ends_on: string }
export type AcademicCalendarEvent = {
  id: string; academic_year_id: string; term_id: string | null; class_group_id: string | null
  class_name: string | null; title: string; category: 'term' | 'holiday' | 'exam' | 'meeting' | 'event' | 'assessment' | 'other'
  audience: 'all' | 'students' | 'staff' | 'parents' | 'teachers' | 'class'
  starts_on: string; ends_on: string; description: string | null; created_at: string
}
export type ClassGroup = { id: string; academic_year_id: string; name: string; grade_level: string; stream: string; class_teacher_membership_id?: string | null; class_teacher_name?: string | null }
export type ClassRosterStudent = { id: string; admission_number: string; first_name: string; last_name: string; gender: string | null; status: string; enrolled_on: string }
export type Enrollment = { id: string; student_id: string; academic_year_id: string; class_group_id: string; enrolled_on: string; status: string }
export type Subject = { id: string; code: string; name: string; status: string }
export type Teacher = { membership_id: string; user_id: string; display_name: string; email: string; class_teacher_of?: string | null; classes_taught?: number; subjects_taught?: number }
export type OverviewTerm = { name: string; academic_year: string; ordinal: number; starts_on: string; ends_on: string }
export type OverviewAttendance = {
  date: string; lessons_today: number; sessions_submitted: number; records_total: number
  present: number; late: number; absent: number; excused: number; rate_percent: number | null
}
export type OverviewFinance = {
  invoiced_total: string; paid_total: string; outstanding_total: string
  open_invoice_count: number; overdue_invoice_count: number; overdue_balance: string
}
export type OverviewLesson = {
  id: string; starts_at: string; ends_at: string; subject_code: string; subject_name: string
  class_name: string; teacher_name: string; room: string | null
}
export type OverviewAttention = {
  key: string; kind: 'finance' | 'attendance' | 'academics'; title: string; detail: string
  meta: string; count: number; to: string
}
export type OverviewActivity = { week_start: string; students: number; attendance_rate: number | null; payments: string }
export type SupportSignal = { key: string; title: string; detail: string; severity: 'watch' | 'concern' }
export type SupportRecommendation = { category: 'attendance' | 'academic' | 'assignment' | 'wellbeing' | 'family_contact' | 'other'; title: string; action: string; suggested_owner: string }
export type StudentSupportRow = {
  student_id: string; first_name: string; last_name: string; admission_number: string
  class_group_id: string; class_name: string; support_score: number
  support_level: 'urgent_review' | 'follow_up' | 'monitor' | 'no_current_signal'
  attendance_rate: number | null; recent_attendance_rate: number | null
  assessment_average: number | null; assessment_change_points: number | null
  missing_assignments: number; recent_incidents: number; signal_count: number
  signals: SupportSignal[]; recommendations: SupportRecommendation[]
}
export type StudentSupportSummary = {
  academic_year_id: string; academic_year_name: string; term_id: string | null; term_name: string | null
  generated_at: string; students_total: number; urgent_review: number; follow_up: number; monitor: number
  students: StudentSupportRow[]
}
export type SupportIntervention = {
  id: string; student_id: string; student_name: string; admission_number: string; class_name: string
  academic_year_id: string; term_id: string | null
  category: 'attendance' | 'academic' | 'assignment' | 'wellbeing' | 'family_contact' | 'other'
  title: string; action: string; status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
  assigned_to_membership_id: string | null; assigned_to_name: string | null
  follow_up_on: string | null; outcome: string | null
  baseline_attendance_rate: number | null; baseline_assessment_average: number | null
  latest_attendance_rate: number | null; latest_assessment_average: number | null
  completed_at: string | null
  created_at: string; updated_at: string
}
export type SupportAssignee = { membership_id: string; display_name: string; role: string }
export type DemoSeedResult = {
  invoices_created: number; payments_created: number
  attendance_records_created: number; results_created: number
  profiles_filled: number; guardians_created: number; teachers_created: number
  subject_assignments_created: number; class_teachers_set: number; timetable_created: number
  behavior_created: number; documents_created: number
  history_year_created: boolean; history_results_created: number
  history_invoices_created: number; history_payments_created: number
  calendar_events_created: number
  invoiced_total: string; paid_total: string
}
export type Overview = {
  generated_at: string; current_term: OverviewTerm | null
  students_total: number; teachers_total: number; classes_total: number
  attendance: OverviewAttendance | null; finance: OverviewFinance | null
  lessons_today: OverviewLesson[]; attention: OverviewAttention[]; activity: OverviewActivity[]
}
export type TeacherClassDashboard = {
  id: string; name: string; grade_level: string; stream: string; is_class_teacher: boolean
  subjects: string[]; students_total: number; present: number; late: number; absent: number
  unmarked: number; attendance_rate: number | null; upcoming_assessments: number
  overdue_submissions: number; recent_behavior_records: number
}
export type TeacherDashboard = {
  generated_at: string; academic_year: string | null; current_term: OverviewTerm | null
  students_total: number; attendance_marked: number; attendance_total: number
  upcoming_assessments: number; overdue_submissions: number; recent_behavior_records: number
  classes: TeacherClassDashboard[]; lessons_today: OverviewLesson[]; timetable: OverviewLesson[]
}
export type AdminTeacher = {
  membership_id: string; user_id: string; display_name: string; email: string
  status: string; class_count: number; subject_count: number; created_at: string
}
export type TimetableSlot = {
  id: string; academic_year_id: string; class_group_id: string; class_name: string
  subject_id: string; subject_name: string; subject_code: string
  teacher_membership_id: string; teacher_name: string
  day_of_week: number; day_name: string; starts_at: string; ends_at: string; room: string | null
}
export type TeachingAssignment = {
  id: string; class_group_id: string; class_name: string; academic_year_id: string
  subject_id: string; subject_name: string; subject_code: string; teacher_membership_id: string
  teacher_name: string; teacher_email: string
}
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'unmarked'
export type AttendanceStudent = {
  student_id: string; admission_number: string; first_name: string; last_name: string
  status: AttendanceStatus; note: string | null
}
export type AttendanceSheet = {
  class_group_id: string; class_name: string; academic_year_id: string
  attendance_date: string; session_id: string | null; updated_at: string | null
  students: AttendanceStudent[]
}
export type AssessmentStatus = 'open' | 'submitted' | 'returned' | 'approved'
export type AssessmentCategory = 'quiz' | 'assignment' | 'project' | 'class_test' | 'examination' | 'practical' | 'other'
export type AssessmentSummary = {
  id: string; academic_year_id: string; class_group_id: string; class_name: string
  subject_id: string; subject_name: string; subject_code: string; term_id: string; term_name: string
  title: string; category: AssessmentCategory; max_score: string; weight_percent: string
  due_on: string | null; status: AssessmentStatus; review_note: string | null
  created_at: string; updated_at: string
}
export type GradebookStudent = {
  student_id: string; admission_number: string; first_name: string; last_name: string
  score: string | null; comment: string | null
  submission_status: 'not_recorded' | 'submitted' | 'missing' | 'excused'
}
export type Gradebook = { assessment: AssessmentSummary; students: GradebookStudent[] }
export type ExamQuestion = { id: string; position: number; text: string; type: 'multiple_choice' | 'written'; points: string; options: { id: string; text: string; correct?: boolean }[] }
export type OnlineExam = {
  id: string; assessment_id: string; title: string; class_group_id: string; class_name: string
  subject_id: string; term_id: string; duration_minutes: number; instructions: string | null
  opens_at: string | null; closes_at: string | null; published: boolean; questions: ExamQuestion[]
}
export type OnlineExamCard = {
  id: string; assessment_id: string; title: string; subject_id: string; duration_minutes: number
  instructions: string | null; opens_at: string | null; closes_at: string | null
  attempt_status: 'not_started' | 'in_progress' | 'submitted' | 'reviewed'; deadline_at: string | null; score: string | null
}
export type GradingBand = {
  min_percent: string; max_percent: string; grade: string
  points: string | null; description: string | null
}
export type GradingScale = {
  id: string; name: string; is_default: boolean; include_positions: boolean
  status: string; bands: GradingBand[]; created_at: string; updated_at: string
}
export type SubjectResult = {
  subject_id: string; subject_name: string; subject_code: string
  weighted_total: string; grade: string | null; points: string | null
  assessment_count: number; total_weight: string
}
export type StudentResult = {
  student_id: string; admission_number: string; first_name: string; last_name: string
  subjects: SubjectResult[]; aggregate_percent: string | null
  grade: string | null; points: string | null; position: number | null
}
export type PublicationState = { status: 'draft' | 'published' | 'withdrawn'; published_at: string | null; withdrawn_at: string | null }
export type ClassResults = {
  class_group_id: string; class_name: string; term_id: string; term_name: string
  academic_year_id: string; publication: PublicationState
  grading_scale_name: string | null; students: StudentResult[]
}
export type StudentAssessmentBreakdown = {
  id: string; title: string; category: string; score: string | null; max_score: string
  score_percent: string | null; weight_percent: string; contribution_percent: string | null
  submission_status: string
}
export type StudentSubjectBreakdown = {
  subject_id: string; subject_name: string; weighted_total: string | null; grade: string | null
  points: string | null; total_weight: string; weight_share_percent: string | null
  term_contribution_percent: string | null; assessments: StudentAssessmentBreakdown[]
}
export type StudentResultBreakdown = {
  student_id: string; student_name: string; admission_number: string; class_name: string
  term_name: string; grading_scale_name: string | null; aggregate_percent: string | null
  grade: string | null; points: string | null
  grade_band: { min_percent: string; max_percent: string; description: string | null } | null
  position: number | null; class_size: number; subjects: StudentSubjectBreakdown[]
}
export type ReportCardSubject = {
  subject_id: string; subject_name: string; subject_code: string
  weighted_total: string; grade: string | null; points: string | null
  assessment_count: number; total_weight: string
}
export type ImportRow = {
  row_number: number
  admission_number: string
  first_name: string
  last_name: string
  date_of_birth: string | null
  status: 'valid' | 'error' | 'duplicate' | 'created'
  message: string | null
}
export type ImportJobSummary = {
  id: string
  filename: string
  status: 'previewed' | 'confirmed'
  total_rows: number
  valid_rows: number
  duplicate_rows: number
  error_rows: number
  created_rows: number
  skipped_rows: number
  created_at: string
  confirmed_at: string | null
}
export type ImportJobDetail = ImportJobSummary & {
  column_map: Record<string, string>
  rows: ImportRow[]
}
export type ImportHistoryPage = { items: ImportJobSummary[]; page: number; page_size: number; total: number }
export type ReportCard = {
  school_name: string; academic_year_id: string; academic_year_name: string
  term_id: string; term_name: string; term_starts_on: string; term_ends_on: string
  class_group_id: string; class_name: string; class_stream: string
  student_id: string; admission_number: string; first_name: string; last_name: string
  subjects: ReportCardSubject[]; aggregate_percent: string
  aggregate_grade: string | null; aggregate_points: string | null
  position: number | null; class_size: number
  grading_scale_name: string | null; published_at: string | null; published_by: string | null
}
export type ParentReportCardTerm = {
  term_id: string; term_name: string; academic_year_name: string; published_at: string
  aggregate_percent: string | null; grade: string | null; position: number | null
}
export type FeeCategory = { id: string; name: string; created_at: string }
export type FeeStructure = {
  id: string; fee_category_id: string; category_name: string
  class_group_id: string; class_name: string; academic_year_id: string
  term_id: string; term_name: string; amount: string; status: 'active' | 'archived'
}
export type InvoiceStatus = 'issued' | 'partially_paid' | 'paid' | 'void'
export type InvoiceSummary = {
  id: string; invoice_number: string; student_id: string; student_name: string
  admission_number: string; class_name: string | null; term_id: string; term_name: string
  total_amount: string; paid_amount: string; balance: string; status: InvoiceStatus; issued_on: string
}
export type InvoiceLine = { id: string; description: string; amount: string; fee_structure_id: string | null }
export type InvoiceAllocation = {
  id: string; payment_id: string; receipt_number: string
  payment_date: string; method: string; amount: string
  refunded_amount: string; refundable_amount: string
}
export type InvoiceRefund = {
  id: string; refund_number: string; amount: string; reason: string
  refund_date: string; created_at: string
}
export type InvoiceRefundResult = InvoiceRefund & {
  invoice_id: string; invoice_paid_amount: string; invoice_balance: string; invoice_status: InvoiceStatus
}
export type InvoiceDetail = InvoiceSummary & {
  academic_year_id: string; lines: InvoiceLine[]; allocations: InvoiceAllocation[]; refunds: InvoiceRefund[]
}
export type InvoicePage = { items: InvoiceSummary[]; page: number; page_size: number; total: number }
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'cheque' | 'other'
export type Payment = {
  id: string; receipt_number: string; student_id: string; student_name: string
  amount: string; method: PaymentMethod; reference: string | null; payment_date: string
  status: string; note: string | null; allocated_amount: string; unallocated_amount: string; created_at: string
}
export type PaymentPage = { items: Payment[]; page: number; page_size: number; total: number }
export type FinanceSummary = {
  invoiced_total: string; paid_total: string; outstanding_total: string
  open_invoice_count: number; payments_total: string; credit_total: string
}
export type GenerateInvoicesResult = {
  created: number; skipped: number; students: number
  fee_lines_per_invoice: number; total_billed: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  audience: string
  class_group_id: string | null
  published_at: string
  expires_at: string | null
  status: string
}

export interface Notification {
  id: string
  title: string
  body: string
  type: string
  read_at: string | null
  link: string | null
  created_at: string
}

export interface Guardian {
  guardian_id: string
  student_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  relationship: string | null
  is_primary: boolean
}
