export type Parent = {
  user_id: string;
  school_id: string;
  school_name: string;
  school_slug: string;
  display_name: string;
  email: string;
  role: string;
};
export type Child = {
  id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  status: string;
  class_name?: string | null;
};
export type ReportSummary = {
  term_id: string;
  term_name: string;
  academic_year_name: string;
  published_at: string;
  aggregate_percent: string | number | null;
  grade: string | null;
  position: number | null;
};
export type TermReportCard = {
  school_name: string;
  academic_year_name: string;
  term_name: string;
  student_id: string;
  admission_number: string;
  first_name: string;
  last_name: string;
  class_name: string;
  class_stream: string;
  subjects: {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    weighted_total: string | number;
    grade: string | null;
    points: string | number | null;
    assessment_count: number;
    total_weight: string | number;
  }[];
  aggregate_percent: string | number;
  aggregate_grade: string | null;
  aggregate_points: number | null;
  position: number | null;
  class_size: number;
  grading_scale_name: string | null;
  published_at: string | null;
  published_by: string | null;
};
export type AttendanceRecord = {
  date: string;
  status: "present" | "absent" | "late" | "excused";
  note: string | null;
};
export type AttendanceSummary = {
  records: AttendanceRecord[];
  counts: Record<AttendanceRecord["status"], number>;
  total_recorded: number;
};
export type FeeInvoice = {
  id: string;
  invoice_number: string;
  term_name: string;
  academic_year_name: string;
  issued_on: string;
  status: string;
  total_amount: string;
  paid_amount: string;
  balance: string;
};
export type FeePayment = {
  id: string;
  receipt_number: string;
  amount: string;
  method: string;
  reference: string | null;
  payment_date: string;
  status: string;
};
export type FeesSummary = {
  currency: string | null;
  invoices: FeeInvoice[];
  payments: FeePayment[];
  invoiced_total: string;
  paid_total: string;
  outstanding_total: string;
};
export type TimetableEntry = {
  id: string;
  day_of_week: number;
  day_name: string;
  subject_name: string;
  teacher_name: string;
  starts_at: string;
  ends_at: string;
  room: string | null;
};
export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  published_at: string;
  expires_at: string | null;
  status: string;
};
export type SchoolEvent = {
  id: string;
  title: string;
  category: string;
  starts_on: string;
  ends_on: string;
  description: string | null;
};
export type Notification = {
  id: string;
  title: string;
  body: string;
  type: string;
  read_at: string | null;
  link: string | null;
  created_at: string;
};
