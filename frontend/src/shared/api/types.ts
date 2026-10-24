export type Session = {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  csrf_token: string
}

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
}

export type StudentPage = { items: Student[]; page: number; page_size: number; total: number }
export type AcademicYear = { id: string; name: string; starts_on: string; ends_on: string; status: string }
export type AcademicTerm = { id: string; academic_year_id: string; name: string; ordinal: number; starts_on: string; ends_on: string }
export type ClassGroup = { id: string; academic_year_id: string; name: string; grade_level: string; stream: string }
export type Enrollment = { id: string; student_id: string; academic_year_id: string; class_group_id: string; enrolled_on: string; status: string }
export type Subject = { id: string; code: string; name: string; status: string }
export type Teacher = { membership_id: string; user_id: string; display_name: string; email: string }
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
}
export type Gradebook = { assessment: AssessmentSummary; students: GradebookStudent[] }
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
