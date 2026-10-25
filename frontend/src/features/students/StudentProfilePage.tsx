import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useReactToPrint } from 'react-to-print'
import {
  Alert, Button, DatePicker, Dropdown, Empty, Form, Input, message, Modal, Popconfirm,
  Select, Spin, Tabs, Tag,
} from 'antd'
import {
  ArrowLeftOutlined, DeleteOutlined, DownOutlined, EditOutlined, KeyOutlined,
  PlusOutlined, PrinterOutlined, SendOutlined, StopOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import type { ProfileGuardian, ProfileLesson, ProfileWeekdayLesson, StudentProfile } from '../../shared/api/types'
import {
  fetchStudentProfile, fileStudentDocument,
  messageStudentGuardians, recordBehavior, removeStudentDocument, removeBehavior,
  setStudentPassword, updateGuardian, updateStudent,
} from './studentsApi'
import type { StudentEdit } from './studentsApi'

const statusColors: Record<string, string> = {
  active: 'green', transferred: 'blue', graduated: 'purple', withdrawn: 'default',
}

const barColors: Record<string, string> = {
  present: '#45b894', late: '#e6a750', absent: '#e0645c', excused: '#6580e9',
}

const EDIT_ROLES = ['school_admin', 'principal', 'registrar']
const PASSWORD_ROLES = ['school_admin', 'principal']

// Illustrations downloaded from DiceBear's open-source Notionists style.
const AVATAR_FILES = ['Selorm.svg', 'Afua.svg', 'Kwesi.svg', 'Ama.svg', 'Kojo.svg', 'Naa.svg']

const activityMeta: Record<string, { color: string; icon: string }> = {
  attendance: { color: 'green', icon: 'calendar-event' },
  payment: { color: 'blue', icon: 'wallet' },
  result: { color: 'purple', icon: 'book-2' },
  behavior: { color: 'gold', icon: 'flag' },
  document: { color: 'blue', icon: 'file-text' },
}

const behaviorMeta: Record<string, { color: string; label: string }> = {
  merit: { color: 'green', label: 'Merit' },
  demerit: { color: 'gold', label: 'Demerit' },
  incident: { color: 'red', label: 'Incident' },
  note: { color: 'blue', label: 'Note' },
}

const severityMeta: Record<string, { color: string; label: string }> = {
  low: { color: 'default', label: 'Low' },
  medium: { color: 'orange', label: 'Medium' },
  high: { color: 'red', label: 'High' },
}

const documentTypes: Record<string, string> = {
  id_card: 'Student ID card',
  birth_certificate: 'Birth certificate',
  previous_report: 'Previous report card',
  medical: 'Medical record',
  consent: 'Consent form',
  other: 'Other document',
}

/** Monochrome Tabler outline icon, tinted by the surrounding text colour. */
function ProfileIcon({ name }: { name: string }) {
  const url = `/profile/icons/${name}.svg`
  return <span className="profile-icon" aria-hidden="true"
    style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }} />
}

function IconChip({ color, name }: { color: string; name: string }) {
  return <span className={`icon-chip ${color}`} aria-hidden="true"><ProfileIcon name={name} /></span>
}

function invoiceTag(status: string) {
  if (status === 'paid') return { color: 'green', label: 'Paid' }
  if (status === 'partially_paid') return { color: 'gold', label: 'Partial' }
  return { color: 'red', label: 'Pending' }
}

function money(value: string | number) {
  return Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type StudentFeePayment = NonNullable<StudentProfile['finance']>['payments'][number]

function FeeReceiptDocument({ payment, student, admissionNumber, schoolName, className }: {
  payment: StudentFeePayment; student: string; admissionNumber: string; schoolName: string; className?: string
}) {
  const method = payment.method.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
  return <article className="fee-receipt-document" data-receipt-number={payment.receipt_number}>
    <header className="fee-receipt-header">
      <div className="fee-receipt-brand">
        <span className="fee-receipt-mark">{schoolName.trim().slice(0, 1).toUpperCase() || 'S'}</span>
        <div><h1>{schoolName || 'School'}</h1><span>School fees · Official receipt</span></div>
      </div>
      <div className="fee-receipt-rule" />
      <div className="fee-receipt-title"><div><h2>Payment receipt</h2><p>Thank you. This receipt confirms payment received.</p></div>
        <div><span>Receipt number</span><strong>{payment.receipt_number}</strong></div></div>
    </header>
    <div className="fee-receipt-content">
      <div className="fee-receipt-status">Payment received</div>
      <h3>Student details</h3>
      <div className="fee-receipt-details">
        <div><span>Student name</span><strong>{student}</strong></div>
        <div><span>Admission number</span><strong>{admissionNumber}</strong></div>
        <div><span>Class</span><strong>{className || '—'}</strong></div>
        <div><span>Payment date</span><strong>{dayjs(payment.payment_date).format('D MMMM YYYY')}</strong></div>
      </div>
      <div className="fee-receipt-amount"><div><span>Amount received</span><strong>GH₵ {money(payment.amount)}</strong></div><span className="fee-receipt-method">{method}</span></div>
      <h3>Payment breakdown</h3>
      <table className="fee-receipt-breakdown"><tbody>
        <tr><td>Amount received</td><td>GH₵ {money(payment.amount)}</td></tr>
        <tr><td>Applied to school fees</td><td>GH₵ {money(payment.allocated_amount)}</td></tr>
        <tr><td>Unallocated student credit</td><td>GH₵ {money(payment.unallocated_amount)}</td></tr>
        <tr><td>Payment reference</td><td>{payment.reference || '—'}</td></tr>
        <tr className="fee-receipt-total"><td>Receipt total</td><td>GH₵ {money(payment.amount)}</td></tr>
      </tbody></table>
      <p className="fee-receipt-note">Keep this receipt for your records. Please contact the school finance office if any detail needs correction.</p>
      <footer className="fee-receipt-footer"><span>Generated {dayjs().format('D MMM YYYY, h:mm A')}</span><span>School finance office</span></footer>
    </div>
  </article>
}

function PanelHead({ icon, color, title, sub, right }: {
  icon: string; color: string; title: string; sub?: string; right?: ReactNode
}) {
  return <div className="panel-heading">
    <div>
      <h2><IconChip color={color} name={icon} />{title}</h2>
      {sub ? <p>{sub}</p> : null}
    </div>
    {right}
  </div>
}

function StatCard({ name, value, delta, note, color, icon, progress, bars }: {
  name: string; value: string; delta?: string; note?: string
  color: 'blue' | 'green' | 'red' | 'purple'; icon: string
  progress?: number | null; bars?: number[]
}) {
  const barWidth = progress == null ? null : Math.max(0, Math.min(100, progress))
  return <article className="stat-card">
    <div className="stat-card-top">
      <IconChip color={color} name={icon} />
      <span className="stat-name">{name}</span>
    </div>
    <div className="stat-value">{value}</div>
    {bars && bars.length > 0 && <div className="stat-spark" aria-hidden="true">
      {bars.map((height, index) => <i key={index} style={{ height: `${Math.max(14, Math.min(100, height))}%` }} />)}
    </div>}
    {barWidth != null && <div className="stat-progress" aria-hidden="true">
      <span className={color} style={{ width: `${barWidth}%` }} />
    </div>}
    {(delta || note) && <div className="stat-foot">
      {delta ? <span className="delta">{delta}</span> : null}
      {note ? <span>{note}</span> : null}
    </div>}
  </article>
}

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>()
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('overview')
  const [resultYear, setResultYear] = useState('all')
  const [selectedReceipt, setSelectedReceipt] = useState<StudentFeePayment | null>(null)
  const receiptContentRef = useRef<HTMLDivElement>(null)
  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptContentRef,
    documentTitle: () => {
      const number = receiptContentRef.current?.querySelector('[data-receipt-number]')?.getAttribute('data-receipt-number')
      return number ? `School_Fee_Receipt_${number}` : 'School_Fee_Receipt'
    },
    onAfterPrint: () => setSelectedReceipt(null),
    pageStyle: '@page { size: A4; margin: 14mm; }',
  })

  const printReceipt = (payment: StudentFeePayment) => {
    setSelectedReceipt(payment)
    requestAnimationFrame(() => handlePrintReceipt())
  }

  const [editOpen, setEditOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [behaviorOpen, setBehaviorOpen] = useState(false)
  const [documentOpen, setDocumentOpen] = useState(false)
  const [guardianEdit, setGuardianEdit] = useState<ProfileGuardian | null>(null)

  const [editForm] = Form.useForm()
  const [resetForm] = Form.useForm()
  const [messageForm] = Form.useForm()
  const [behaviorForm] = Form.useForm()
  const [documentForm] = Form.useForm()
  const [passwordForm] = Form.useForm()
  const [guardianForm] = Form.useForm()

  const canEdit = EDIT_ROLES.includes(user?.role ?? '')
  const canPassword = PASSWORD_ROLES.includes(user?.role ?? '')

  const query = useQuery({
    queryKey: ['student-profile', studentId],
    queryFn: () => fetchStudentProfile(accessToken!, studentId!),
    enabled: Boolean(accessToken && studentId),
  })
  const data = query.data

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['student-profile', studentId] })

  const editMutation = useMutation({
    mutationFn: (payload: StudentEdit) => updateStudent(accessToken!, studentId!, payload),
    onSuccess: () => { message.success('Profile updated'); setEditOpen(false); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  const passwordMutation = useMutation({
    mutationFn: (payload: { current_password?: string; new_password: string }) =>
      setStudentPassword(accessToken!, studentId!, payload),
    onSuccess: result => {
      message.success(result.created_account
        ? `Portal account created for ${result.email}`
        : 'Password updated')
      passwordForm.resetFields()
      setResetOpen(false)
      void refresh()
    },
    onError: error => {
      const detail = formatApiError(error)
      message.error(/email/i.test(detail)
        ? `${detail} — use Edit Profile to add one`
        : detail)
    },
  })

  const messageMutation = useMutation({
    mutationFn: (payload: { title: string; body: string }) =>
      messageStudentGuardians(accessToken!, studentId!, payload),
    onSuccess: result => {
      message.success(`Message sent to ${result.guardian_names.join(', ')}`)
      messageForm.resetFields()
      setMessageOpen(false)
    },
    onError: error => message.error(formatApiError(error)),
  })

  const behaviorMutation = useMutation({
    mutationFn: (payload: Parameters<typeof recordBehavior>[2]) =>
      recordBehavior(accessToken!, studentId!, payload),
    onSuccess: () => { message.success('Behaviour note recorded'); behaviorForm.resetFields(); setBehaviorOpen(false); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  const behaviorDelete = useMutation({
    mutationFn: (recordId: string) => removeBehavior(accessToken!, studentId!, recordId),
    onSuccess: () => { message.success('Behaviour note removed'); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  const documentMutation = useMutation({
    mutationFn: (payload: Parameters<typeof fileStudentDocument>[2]) =>
      fileStudentDocument(accessToken!, studentId!, payload),
    onSuccess: () => { message.success('Document filed'); documentForm.resetFields(); setDocumentOpen(false); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  const documentDelete = useMutation({
    mutationFn: (recordId: string) => removeStudentDocument(accessToken!, studentId!, recordId),
    onSuccess: () => { message.success('Document removed'); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  const guardianMutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateGuardian>[2]) =>
      updateGuardian(accessToken!, guardianEdit!.guardian_id, payload),
    onSuccess: () => { message.success('Guardian updated'); setGuardianEdit(null); void refresh() },
    onError: error => message.error(formatApiError(error)),
  })

  // Last 30 calendar days, coloured by that day's record (grey when unmarked).
  const attendanceTrail = useMemo(() => {
    if (!data?.attendance) return []
    const byDay = new Map(data.attendance.recent.map(item => [item.day, item.status]))
    return Array.from({ length: 30 }, (_, index) => {
      const day = dayjs().subtract(29 - index, 'day')
      const key = day.format('YYYY-MM-DD')
      return { key, label: day.format('D MMM'), status: byDay.get(key) ?? null }
    })
  }, [data?.attendance])

  const averages = useMemo(() => {
    const published = (data?.results ?? []).filter(item => item.published)
    const source = published.length ? published : (data?.results ?? [])
    if (!source.length) return null
    const mean = source.reduce((sum, item) => sum + Number(item.aggregate_percent), 0) / source.length
    return { mean: Math.round(mean * 10) / 10, count: source.length }
  }, [data?.results])

  // Today's lessons, falling back to the next school day when today has none.
  const scheduleView = useMemo<{ lessons: ProfileLesson[]; label: string; isToday: boolean }>(() => {
    if (!data) return { lessons: [], label: '', isToday: true }
    if (data.schedule_today.length) {
      return { lessons: data.schedule_today, label: dayjs().format('dddd D MMMM'), isToday: true }
    }
    const todayIndex = (dayjs().day() + 6) % 7 // Monday = 0, matching the backend
    for (let step = 1; step <= 7; step += 1) {
      const index = (todayIndex + step) % 7
      const dayLessons = data.schedule.filter(item => item.day_of_week === index)
      if (dayLessons.length) {
        return { lessons: dayLessons, label: `${dayLessons[0].day_name} · next school day`, isToday: false }
      }
    }
    return { lessons: [], label: dayjs().format('dddd D MMMM'), isToday: true }
  }, [data])

  const timetable = useMemo(() => {
    if (!data?.schedule.length) return null
    const days = [...new Set(data.schedule.map(item => item.day_of_week))].sort((a, b) => a - b)
    const times = [...new Set(data.schedule.map(item => item.starts_at))].sort()
    const cells = new Map<string, ProfileWeekdayLesson>()
    data.schedule.forEach(item => cells.set(`${item.day_of_week}|${item.starts_at}`, item))
    const dayName = (day: number) =>
      data.schedule.find(item => item.day_of_week === day)?.day_name ?? ''
    return { days, times, cells, dayName }
  }, [data])

  const yearOptions = useMemo(() => {
    const years = [...new Set((data?.results ?? []).map(item => item.academic_year))]
    return years.map(year => ({ value: year, label: year }))
  }, [data?.results])

  if (query.isLoading) {
    return <div className="page-content"><div className="attendance-loading"><Spin size="large" /><span>Loading student profile…</span></div></div>
  }
  if (query.isError) {
    return <div className="page-content">
      <Link to="/students" className="profile-back"><ArrowLeftOutlined /> Back to students</Link>
      <Alert type="error" showIcon message="Could not load this student"
        description={formatApiError(query.error)}
        action={<Button size="small" onClick={() => void query.refetch()}>Retry</Button>} />
    </div>
  }
  if (!data) return null

  const {
    student, enrollment, guardians, attendance, finance, results,
    subjects, behavior, documents, activities,
  } = data
  const primaryGuardian = guardians.find(item => item.is_primary) ?? guardians[0]
  const openInvoices = (finance?.invoices ?? []).filter(item => item.status !== 'paid')
  const attended = attendance ? attendance.present + attendance.late : 0
  const subjectCodes = subjects.length
    ? subjects.map(item => item.subject_code).join(', ')
    : '—'
  // Stable per-student pick so the same student always gets the same avatar.
  const avatarFile = AVATAR_FILES[
    [...student.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_FILES.length
  ]

  const factRow: { icon: string; label: string; value: string; sub?: string }[] = [
    { icon: 'cake', label: 'Date of birth', value: student.date_of_birth
        ? `${dayjs(student.date_of_birth).format('D MMM YYYY')}${student.age_years != null ? ` (${student.age_years} yrs)` : ''}`
        : '—' },
    { icon: 'users', label: 'Gender', value: student.gender
        ? student.gender[0].toUpperCase() + student.gender.slice(1) : '—' },
    { icon: 'phone', label: 'Phone', value: student.phone ?? '—' },
    { icon: 'mail', label: 'Email', value: student.email ?? '—' },
    { icon: 'users', label: 'Parent / guardian', value: primaryGuardian?.full_name ?? 'Not linked',
      sub: primaryGuardian?.phone ?? undefined },
  ]

  const statCards: Parameters<typeof StatCard>[0][] = [
    { name: 'Current class', value: enrollment?.class_name ?? 'Not enrolled', color: 'blue' as const,
      icon: 'school', delta: enrollment ? enrollment.grade_level : '—',
      note: enrollment ? enrollment.academic_year : 'no active enrolment' },
    { name: 'Attendance (this term)',
      value: attendance?.rate_percent != null ? `${attendance.rate_percent}%` : '—',
      color: 'green' as const, icon: 'calendar-event',
      delta: attendance && attendance.days_marked ? `${attended}/${attendance.days_marked} days present` : 'Not marked yet',
      note: attendance?.days_marked ? 'present or late' : 'no records this term',
      progress: attendance?.rate_percent ?? null },
  ]
  if (finance) {
    const invoiced = Number(finance.invoiced_total)
    statCards.push({ name: 'Total fees due', value: `₵ ${money(finance.outstanding_total)}`,
      color: 'red' as const, icon: 'wallet',
      delta: openInvoices.length ? `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}` : 'All settled',
      note: `₵ ${money(finance.paid_total)} paid`,
      progress: invoiced > 0 ? (Number(finance.outstanding_total) / invoiced) * 100 : 0 })
  }
  if (averages) {
    statCards.push({ name: 'Overall average', value: `${averages.mean}%`,
      color: 'purple' as const, icon: 'book-2',
      delta: results[0]?.grade ?? '—',
      note: `across ${averages.count} term${averages.count === 1 ? '' : 's'}`,
      bars: results.map(item => Number(item.aggregate_percent)) })
  }

  const filteredResults = resultYear === 'all'
    ? results
    : results.filter(item => item.academic_year === resultYear)
  const feeRows = [...(finance?.invoices ?? [])].sort((a, b) =>
    a.issued_on === b.issued_on ? a.invoice_number.localeCompare(b.invoice_number)
      : a.issued_on.localeCompare(b.issued_on))

  const openEdit = () => setEditOpen(true)

  const deactivateStudent = () => {
    Modal.confirm({
      title: `Deactivate ${student.display_name}?`,
      content: 'The student stays on record but is marked as withdrawn. You can restore the status from Edit Profile.',
      okText: 'Deactivate',
      okButtonProps: { danger: true },
      onOk: () => editMutation.mutateAsync({ status: 'withdrawn' }),
    })
  }

  const handleMoreActions = ({ key }: { key: string }) => {
    if (key === 'reset') setResetOpen(true)
    if (key === 'print') window.print()
    if (key === 'message') setMessageOpen(true)
    if (key === 'deactivate' && student.status === 'active') deactivateStudent()
  }

  const overviewTabs = [
    {
      key: 'overview', label: 'Overview',
      children: <>
        <section className="stats-grid profile-stats" aria-label="Student summary">
          {statCards.map(item => <StatCard key={item.name} {...item} />)}
        </section>
        <div className="profile-panels">
          <div className="panel-col">
            <section className="panel profile-panel">
              <PanelHead icon="book-2" color="blue" title="Academic performance"
                sub="Computed term results across the school years"
                right={<Select size="small" className="year-filter" value={resultYear}
                  onChange={setResultYear}
                  options={[{ value: 'all', label: 'All Terms' }, ...yearOptions]} />} />
              {filteredResults.length ? <table className="profile-table">
                <thead><tr><th>TERM</th><th>CLASS</th><th>SUBJECTS</th><th>OVERALL GRADE</th><th>STATUS</th></tr></thead>
                <tbody>{filteredResults.slice(0, 6).map(item => <tr key={item.term_id}>
                  <td><strong>{item.term_name}</strong> ({item.academic_year})</td>
                  <td>{enrollment?.class_name ?? '—'}</td>
                  <td>{subjectCodes}</td>
                  <td><strong>{item.grade ?? '—'}</strong>{item.grade ? ` (${Number(item.aggregate_percent)}%)` : ''}</td>
                  <td>{item.published
                    ? <Tag color="green" variant="filled">Passed</Tag>
                    : <Tag color="gold" variant="filled">In Progress</Tag>}</td>
                </tr>)}</tbody>
              </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No term results computed yet" />}
              {results.length > 0 && <button type="button" className="see-all"
                onClick={() => setTab('history')}>View full academic history <span>→</span></button>}
            </section>
            {finance && <section className="panel profile-panel">
              <PanelHead icon="wallet" color="red" title="Fees & payments"
                sub="Invoices issued to this student"
                right={<button type="button" className="see-all" onClick={() => setTab('fees')}>View all <span>→</span></button>} />
              {feeRows.length ? <table className="profile-table">
                <thead><tr><th>TERM</th><th>AMOUNT</th><th>PAID</th><th>DUE</th><th>STATUS</th></tr></thead>
                <tbody>{feeRows.map(invoice => {
                  const tag = invoiceTag(invoice.status)
                  return <tr key={invoice.id}>
                    <td><strong>{invoice.term_name}</strong></td>
                    <td>₵ {money(invoice.total_amount)}</td>
                    <td>₵ {money(invoice.paid_amount)}</td>
                    <td className={Number(invoice.balance) > 0 ? 'balance-due' : ''}>₵ {money(invoice.balance)}</td>
                    <td><Tag color={tag.color} variant="filled">{tag.label}</Tag></td>
                  </tr>
                })}</tbody>
              </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices issued yet" />}
              {feeRows.length > 0 && <button type="button" className="see-all"
                onClick={() => setTab('fees')}>View payment history <span>→</span></button>}
            </section>}
          </div>
          <div className="panel-col">
            <section className="panel profile-panel">
              <PanelHead icon="calendar-event" color="blue" title="Attendance"
                sub="Current term"
                right={<Tag className="head-tag" color="blue" variant="filled">Last 30 days</Tag>} />
              {attendance && attendance.days_marked > 0 ? <div className="attendance-overview">
                <div className="attendance-donut" style={{ background: `conic-gradient(#45b894 ${attendance.rate_percent ?? 0}%, #eef1f6 ${attendance.rate_percent ?? 0}% 100%)` }}>
                  <div className="attendance-donut-hole"><strong>{attendance.rate_percent}%</strong><span>Present</span></div>
                </div>
                <ul className="attendance-legend">
                  <li><i style={{ background: barColors.present }} /> Present <strong>{attendance.present}</strong></li>
                  <li><i style={{ background: barColors.absent }} /> Absent <strong>{attendance.absent}</strong></li>
                  <li><i style={{ background: barColors.late }} /> Late <strong>{attendance.late}</strong></li>
                  <li><i style={{ background: barColors.excused }} /> Excused <strong>{attendance.excused}</strong></li>
                </ul>
              </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attendance marked this term" />}
              {attendanceTrail.length > 0 && <div className="attendance-trail">
                <div className="attendance-bars" aria-hidden="true">
                  {attendanceTrail.map(day => <i key={day.key} title={`${day.label}: ${day.status ?? 'not marked'}`}
                    style={{ background: day.status ? barColors[day.status] : '#eef1f6' }} />)}
                </div>
                <div className="attendance-trail-labels"><span>{attendanceTrail[0].label}</span><span>{attendanceTrail[attendanceTrail.length - 1].label}</span></div>
              </div>}
              <button type="button" className="see-all" onClick={() => setTab('attendance')}>
                View full attendance report <span>→</span></button>
            </section>
            <section className="panel profile-panel">
              <PanelHead icon="calendar-event" color="green" title="Class schedule"
                sub={scheduleView.label}
                right={<button type="button" className="see-all" onClick={() => setTab('class')}>
                  Full timetable <span>→</span></button>} />
              {scheduleView.lessons.length ? <div className="profile-schedule">
                {scheduleView.lessons.map(lesson => <div className="schedule-row"
                  key={`${lesson.starts_at}-${lesson.subject_code}-${'day_of_week' in lesson ? lesson.day_of_week : ''}`}>
                  <span className="schedule-time">{lesson.starts_at} – {lesson.ends_at}</span>
                  <span className="schedule-subject"><strong>{lesson.subject_name}</strong><small>{lesson.subject_code}</small></span>
                  <span className="schedule-teacher">{lesson.teacher_name}</span>
                  <span className="schedule-room">{lesson.room ?? '—'}</span>
                </div>)}
              </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No lessons scheduled for this class yet" />}
            </section>
          </div>
        </div>
        <section className="panel profile-panel activities-panel">
          <PanelHead icon="flag" color="purple" title="Recent activities"
            sub="Latest events across this student's record" />
          {activities.length ? <div className="activities-strip">
            {activities.map(item => {
              const meta = activityMeta[item.kind] ?? activityMeta.document
              return <article className="activity-item" key={item.key}>
                <IconChip color={meta.color} name={meta.icon} />
                <div className="activity-body">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                  <small>{dayjs(item.at).format('D MMM YYYY, HH:mm')}</small>
                </div>
              </article>
            })}
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No activity recorded yet" />}
        </section>
      </>,
    },
    {
      key: 'history', label: 'Academic History',
      children: <section className="panel profile-panel profile-table-panel">
        <PanelHead icon="book-2" color="blue" title="Academic history"
          sub="Every computed term result on record" />
        {results.length ? <table className="profile-table">
          <thead><tr><th>TERM</th><th>YEAR</th><th>CLASS</th><th>GRADE</th><th>SCORE</th><th>POSITION</th><th>STATUS</th></tr></thead>
          <tbody>{[...results].reverse().map(item => <tr key={item.term_id}>
            <td><strong>{item.term_name}</strong></td>
            <td>{item.academic_year}</td>
            <td>{enrollment?.class_name ?? '—'}</td>
            <td>{item.grade ?? '—'}</td>
            <td>{Number(item.aggregate_percent)}%</td>
            <td>{item.position ? `${item.position}${ordinal(item.position)}` : '—'}</td>
            <td>{item.published ? <Tag color="green" variant="filled">Published</Tag> : <Tag variant="filled">Draft</Tag>}</td>
          </tr>)}</tbody>
        </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No term results computed yet" />}
      </section>,
    },
    {
      key: 'attendance', label: 'Attendance',
      children: <section className="panel profile-panel">
        <PanelHead icon="calendar-event" color="green" title="Attendance"
          sub="Current term, with the last 30 days below" />
        {attendance && attendance.days_marked > 0 ? <div className="attendance-overview">
          <div className="attendance-donut" style={{ background: `conic-gradient(#45b894 ${attendance.rate_percent ?? 0}%, #eef1f6 ${attendance.rate_percent ?? 0}% 100%)` }}>
            <div className="attendance-donut-hole"><strong>{attendance.rate_percent}%</strong><span>Present</span></div>
          </div>
          <ul className="attendance-legend">
            <li><i style={{ background: barColors.present }} /> Present <strong>{attendance.present}</strong></li>
            <li><i style={{ background: barColors.absent }} /> Absent <strong>{attendance.absent}</strong></li>
            <li><i style={{ background: barColors.late }} /> Late <strong>{attendance.late}</strong></li>
            <li><i style={{ background: barColors.excused }} /> Excused <strong>{attendance.excused}</strong></li>
          </ul>
        </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No attendance marked this term" />}
        {attendanceTrail.length > 0 && <div className="attendance-trail">
          <div className="attendance-bars" aria-hidden="true">
            {attendanceTrail.map(day => <i key={day.key} title={`${day.label}: ${day.status ?? 'not marked'}`}
              style={{ background: day.status ? barColors[day.status] : '#eef1f6' }} />)}
          </div>
          <div className="attendance-trail-labels"><span>{attendanceTrail[0].label}</span><span>{attendanceTrail[attendanceTrail.length - 1].label}</span></div>
        </div>}
      </section>,
    },
    {
      key: 'fees', label: 'Fees & Payments',
      children: <section className="panel profile-panel profile-table-panel">
        <PanelHead icon="wallet" color="red" title="Fees & payments" sub="Invoices issued to this student"
          right={finance ? <span className="head-note">₵ {money(finance.outstanding_total)} due</span> : undefined} />
        {!finance ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Fee details are visible to finance roles only" />
          : feeRows.length ? <table className="profile-table">
            <thead><tr><th>INVOICE</th><th>TERM</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th><th>STATUS</th><th>ISSUED</th></tr></thead>
            <tbody>{feeRows.map(invoice => {
              const tag = invoiceTag(invoice.status)
              return <tr key={invoice.id}>
                <td><strong>{invoice.invoice_number}</strong></td>
                <td>{invoice.term_name}</td>
                <td>₵ {money(invoice.total_amount)}</td>
                <td>₵ {money(invoice.paid_amount)}</td>
                <td className={Number(invoice.balance) > 0 ? 'balance-due' : ''}>₵ {money(invoice.balance)}</td>
                <td><Tag color={tag.color} variant="filled">{tag.label}</Tag></td>
                <td>{dayjs(invoice.issued_on).format('D MMM YYYY')}</td>
              </tr>
            })}</tbody>
          </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices issued yet" />}
        {finance && <div className="student-receipts">
          <div className="student-receipts-heading">
            <div><h3>Payment receipts</h3><p>Print a receipt for any recorded full or partial fee payment.</p></div>
            <span>{finance.payments.length} receipt{finance.payments.length === 1 ? '' : 's'}</span>
          </div>
          {finance.payments.length ? <table className="profile-table receipt-table">
            <thead><tr><th>RECEIPT</th><th>DATE</th><th>METHOD</th><th>AMOUNT RECEIVED</th><th>APPLIED</th><th></th></tr></thead>
            <tbody>{finance.payments.map(payment => <tr key={payment.id}>
              <td><strong>{payment.receipt_number}</strong></td>
              <td>{dayjs(payment.payment_date).format('D MMM YYYY')}</td>
              <td>{payment.method.replaceAll('_', ' ')}</td>
              <td>GH₵ {money(payment.amount)}</td>
              <td>GH₵ {money(payment.allocated_amount)}</td>
              <td><Button size="small" icon={<PrinterOutlined/>}
                onClick={() => printReceipt(payment)}>
                Print receipt
              </Button></td>
            </tr>)}</tbody>
          </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No recorded payments to print yet" />}
        </div>}
      </section>,
    },
    {
      key: 'class', label: 'Class & Section',
      children: <>
        <section className="panel profile-panel">
          <PanelHead icon="school" color="blue" title="Enrolment"
            sub={enrollment ? `${enrollment.academic_year} academic year` : 'No active enrolment'} />
          {enrollment ? <div className="class-info-strip">
            <div className="info-tile"><span>Class</span><strong>{enrollment.class_name}</strong></div>
            <div className="info-tile"><span>Stream</span><strong>{enrollment.stream}</strong></div>
            <div className="info-tile"><span>Grade level</span><strong>{enrollment.grade_level}</strong></div>
            <div className="info-tile"><span>Academic year</span><strong>{enrollment.academic_year}</strong></div>
            <div className="info-tile"><span>Enrolled on</span><strong>{dayjs(enrollment.enrolled_on).format('D MMM YYYY')}</strong></div>
            <div className="info-tile"><span>Roll number</span><strong>{student.admission_number}</strong></div>
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="This student is not enrolled in a class yet" />}
        </section>
        <section className="panel profile-panel">
          <PanelHead icon="book-2" color="purple" title="Subjects & teachers"
            sub={`Subjects offered in ${enrollment?.class_name ?? 'this class'}`} />
          {subjects.length ? <table className="profile-table">
            <thead><tr><th>SUBJECT</th><th>CODE</th><th>TEACHER</th></tr></thead>
            <tbody>{subjects.map(item => <tr key={item.subject_code}>
              <td><strong>{item.subject_name}</strong></td>
              <td>{item.subject_code}</td>
              <td>{item.teacher_name ?? 'Not assigned'}</td>
            </tr>)}</tbody>
          </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No subjects assigned to this class yet" />}
        </section>
        <section className="panel profile-panel">
          <PanelHead icon="calendar-event" color="green" title="Weekly timetable"
            sub={enrollment ? `Recurring lessons for ${enrollment.class_name}` : undefined} />
          {timetable ? <div className="timetable-wrap">
            <table className="timetable-grid">
              <thead>
                <tr><th>TIME</th>{timetable.days.map(day => <th key={day}>{timetable.dayName(day)}</th>)}</tr>
              </thead>
              <tbody>{timetable.times.map(time => <tr key={time}>
                <td className="timetable-time">{time}</td>
                {timetable.days.map(day => {
                  const lesson = timetable.cells.get(`${day}|${time}`)
                  return <td key={day} className={lesson ? 'has-lesson' : 'no-lesson'}>
                    {lesson ? <>
                      <strong>{lesson.subject_name}</strong>
                      <span>{lesson.teacher_name}</span>
                      <small>{lesson.room ?? 'Room —'}</small>
                    </> : <span className="free-slot">Free</span>}
                  </td>
                })}
              </tr>)}</tbody>
            </table>
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No timetable created for this class yet" />}
        </section>
      </>,
    },
    {
      key: 'behavior', label: 'Behavior',
      children: <section className="panel profile-panel profile-table-panel">
        <PanelHead icon="flag" color="gold" title="Behavior"
          sub="Merits, demerits, incidents and staff notes"
          right={canEdit ? <Button type="primary" size="small" icon={<PlusOutlined />}
            onClick={() => setBehaviorOpen(true)}>Add note</Button> : undefined} />
        {behavior.length ? <table className="profile-table">
          <thead><tr><th>DATE</th><th>CATEGORY</th><th>SEVERITY</th><th>TITLE</th><th>DESCRIPTION</th><th>ACTION TAKEN</th><th>NOTED BY</th>{canEdit && <th />}</tr></thead>
          <tbody>{behavior.map(record => {
            const category = behaviorMeta[record.category] ?? behaviorMeta.note
            const severity = severityMeta[record.severity] ?? severityMeta.low
            return <tr key={record.id}>
              <td>{dayjs(record.occurred_on).format('D MMM YYYY')}</td>
              <td><Tag color={category.color} variant="filled">{category.label}</Tag></td>
              <td><Tag color={severity.color} variant="outlined">{severity.label}</Tag></td>
              <td><strong>{record.title}</strong></td>
              <td className="table-muted">{record.description ?? '—'}</td>
              <td>{record.action_taken ?? '—'}</td>
              <td>{record.recorded_by}</td>
              {canEdit && <td className="row-actions">
                <Popconfirm title="Remove this note?" okText="Remove" cancelText="Keep"
                  onConfirm={() => behaviorDelete.mutate(record.id)}>
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              </td>}
            </tr>
          })}</tbody>
        </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No behaviour notes recorded yet" />}
      </section>,
    },
    {
      key: 'documents', label: 'Documents',
      children: <section className="panel profile-panel profile-table-panel">
        <PanelHead icon="file-text" color="blue" title="Documents"
          sub="Papers on file for this student"
          right={canEdit ? <Button type="primary" size="small" icon={<PlusOutlined />}
            onClick={() => setDocumentOpen(true)}>File document</Button> : undefined} />
        {documents.length ? <table className="profile-table">
          <thead><tr><th>TYPE</th><th>TITLE</th><th>REFERENCE</th><th>ISSUED</th><th>NOTES</th><th>FILED BY</th><th>FILED</th>{canEdit && <th />}</tr></thead>
          <tbody>{documents.map(record => <tr key={record.id}>
            <td><span className="doc-type"><IconChip color="blue" name="file-text" />
              {documentTypes[record.doc_type] ?? record.doc_type}</span></td>
            <td><strong>{record.title}</strong></td>
            <td>{record.reference ?? '—'}</td>
            <td>{record.issued_on ? dayjs(record.issued_on).format('D MMM YYYY') : '—'}</td>
            <td className="table-muted">{record.notes ?? '—'}</td>
            <td>{record.added_by}</td>
            <td>{dayjs(record.created_at).format('D MMM YYYY')}</td>
            {canEdit && <td className="row-actions">
              <Popconfirm title="Remove this document?" okText="Remove" cancelText="Keep"
                onConfirm={() => documentDelete.mutate(record.id)}>
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            </td>}
          </tr>)}</tbody>
        </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No documents on file yet" />}
      </section>,
    },
  ]

  const moreItems = [
    { key: 'reset', icon: <KeyOutlined />, label: 'Reset password' },
    { key: 'print', icon: <PrinterOutlined />, label: 'Print profile' },
    { key: 'message', icon: <SendOutlined />, label: 'Send message' },
    { type: 'divider' as const },
    { key: 'deactivate', icon: <StopOutlined />, label: 'Deactivate student', danger: true,
      disabled: student.status !== 'active' },
  ]

  return <div className="page-content profile-page">
    <Link to="/students" className="profile-back"><ArrowLeftOutlined /> Back to students</Link>

    <section className="panel profile-header">
      <div className="profile-head-top">
        <div className="profile-identity">
          <span className="profile-avatar">
            <span className="profile-avatar-initials">{student.first_name[0]}{student.last_name[0]}</span>
            <img src={`/profile/avatars/${avatarFile}`} alt="" aria-hidden="true"
              onError={event => { event.currentTarget.style.display = 'none' }} />
          </span>
          <div>
            <div className="profile-name-row">
              <h1>{student.display_name}</h1>
              <Tag color={statusColors[student.status] ?? 'default'} variant="filled">{student.status}</Tag>
              <span className="profile-id-chip">{student.admission_number}</span>
            </div>
            <div className="profile-subline">
              {enrollment && <><span>{enrollment.class_name}</span><span className="dot">·</span></>}
              <span>{user?.school_name}</span>
              <span className="dot">·</span><span>Student ID: {student.admission_number}</span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <Button icon={<EditOutlined />} onClick={openEdit}>Edit Profile</Button>
          <Dropdown menu={{ items: moreItems, onClick: handleMoreActions }}>
            <Button type="primary" icon={<DownOutlined />}>More Actions</Button>
          </Dropdown>
        </div>
      </div>
      <div className="profile-facts">
        {factRow.map(fact => <div className="profile-fact" key={fact.label}>
          <span className="profile-fact-label"><ProfileIcon name={fact.icon} />{fact.label}</span>
          <strong title={fact.value}>{fact.value}</strong>
          {fact.sub ? <small>{fact.sub}</small> : null}
        </div>)}
      </div>
    </section>

    <div className="profile-grid">
      <div className="profile-main">
        <Tabs activeKey={tab} onChange={setTab} items={overviewTabs} />
      </div>
      <aside className="profile-aside">
        <section className="side-card">
          <div className="side-card-head"><h3><IconChip color="blue" name="shield-check" />Student status</h3>
            <Tag color={statusColors[student.status] ?? 'default'} variant="filled">{student.status}</Tag></div>
          <p className="side-note">{enrollment
            ? `Enrolled on ${dayjs(enrollment.enrolled_on).format('D MMM YYYY')}`
            : 'No active enrolment on record'}</p>
        </section>
        <section className="side-card">
          <div className="side-card-head"><h3><IconChip color="blue" name="id-badge-2" />Quick information</h3></div>
          <dl className="quick-list">
            <div><dt>Class</dt><dd>{enrollment?.class_name ?? '—'}</dd></div>
            <div><dt>Roll number</dt><dd>{student.admission_number}</dd></div>
            <div><dt>Stream</dt><dd>{enrollment?.stream ?? '—'}</dd></div>
            <div><dt>Year group</dt><dd>{enrollment?.grade_level ?? '—'}</dd></div>
            <div><dt>Academic year</dt><dd>{enrollment?.academic_year ?? '—'}</dd></div>
          </dl>
        </section>
        <section className="side-card">
          <div className="side-card-head">
            <h3><IconChip color="blue" name="users" />Guardian information</h3>
            {canEdit && guardians.length > 0 && <Button
              className="side-edit" type="text" size="small" icon={<EditOutlined />}
              onClick={() => setGuardianEdit(guardians[0])} />}
          </div>
          {guardians.length ? <div className="guardian-list">
            {guardians.map(guardian => <div className="guardian-row" key={guardian.guardian_id}>
              <div className="guardian-row-head">
                <span className="guardian-avatar">{guardian.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span>
                <div>
                  <strong>{guardian.full_name} <small>({guardian.relationship})</small></strong>
                  {guardian.phone && <span>{guardian.phone}</span>}
                  {guardian.email && <span>{guardian.email}</span>}
                </div>
              </div>
            </div>)}
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No guardians linked yet" />}
        </section>
        {canPassword && <section className="side-card">
          <div className="side-card-head"><h3><IconChip color="blue" name="key" />Password settings</h3></div>
          <p className="side-note">{student.has_portal_login
            ? `Portal account · ${student.email ?? ''}`
            : student.email ?? 'Add an email in Edit Profile to create a portal account'}</p>
          <Form form={passwordForm} layout="vertical" className="password-form"
            onFinish={values => passwordMutation.mutate({
              ...(values.current_password ? { current_password: values.current_password } : {}),
              new_password: values.new_password,
            })}>
            {student.has_portal_login && <Form.Item name="current_password"
              label="Current password" rules={[{ required: true, message: 'Enter the current password' }]}>
              <Input.Password placeholder="Current password" />
            </Form.Item>}
            <Form.Item name="new_password" label="New password"
              rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
              <Input.Password placeholder="Enter new password" />
            </Form.Item>
            <Form.Item name="confirm" label="Confirm password"
              dependencies={['new_password']} rules={[
                { required: true, message: 'Repeat the new password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('new_password') === value) return Promise.resolve()
                    return Promise.reject(new Error('Passwords do not match'))
                  },
                }),
              ]}>
              <Input.Password placeholder="Confirm new password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={passwordMutation.isPending}>
              Update Password
            </Button>
          </Form>
        </section>}
      </aside>
    </div>

    {selectedReceipt && <div className="fee-receipt-source" aria-hidden="true">
      <div ref={receiptContentRef}>
        <FeeReceiptDocument payment={selectedReceipt} student={student.display_name}
          admissionNumber={student.admission_number} schoolName={user?.school_name ?? 'School'}
          className={enrollment?.class_name} />
      </div>
    </div>}

    <Modal open={editOpen} onCancel={() => setEditOpen(false)} title="Edit profile"
      footer={null} width={520} destroyOnClose>
      <p className="modal-intro">Update the student's personal details. Changes appear on the profile immediately.</p>
      <Form form={editForm} layout="vertical" className="student-form"
        initialValues={{
          first_name: student.first_name,
          last_name: student.last_name,
          date_of_birth: student.date_of_birth ? dayjs(student.date_of_birth) : null,
          gender: student.gender ?? undefined,
          phone: student.phone ?? '',
          email: student.email ?? '',
          status: student.status,
        }}
        onFinish={values => editMutation.mutate({
          first_name: values.first_name,
          last_name: values.last_name,
          date_of_birth: values.date_of_birth ? (values.date_of_birth as Dayjs).format('YYYY-MM-DD') : null,
          gender: values.gender ?? null,
          phone: values.phone || null,
          email: values.email || null,
          status: values.status,
        })}>
        <div className="student-form-row">
          <div><Form.Item name="first_name" label="First name"
            rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item></div>
          <div><Form.Item name="last_name" label="Last name"
            rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item></div>
        </div>
        <div className="student-form-row">
          <div><Form.Item name="date_of_birth" label="Date of birth"><DatePicker className="student-date" /></Form.Item></div>
          <div><Form.Item name="gender" label="Gender">
            <Select options={[
              { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' },
              { value: 'other', label: 'Other' },
            ]} allowClear placeholder="Select" />
          </Form.Item></div>
        </div>
        <div className="student-form-row">
          <div><Form.Item name="phone" label="Phone"><Input placeholder="+233 …" /></Form.Item></div>
          <div><Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not a valid email' }]}>
            <Input placeholder="student@school.example.com" /></Form.Item></div>
        </div>
        <Form.Item name="status" label="Status">
          <Select options={[
            { value: 'active', label: 'Active' }, { value: 'transferred', label: 'Transferred' },
            { value: 'graduated', label: 'Graduated' }, { value: 'withdrawn', label: 'Withdrawn' },
          ]} />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={editMutation.isPending}>Save changes</Button>
        </div>
      </Form>
    </Modal>

    <Modal open={resetOpen} onCancel={() => setResetOpen(false)} title="Reset password"
      footer={null} width={430} destroyOnClose>
      <p className="modal-intro">Set a new portal password for {student.display_name} without knowing the current one.</p>
      <Form form={resetForm} layout="vertical" className="student-form"
        onFinish={values => passwordMutation.mutate({ new_password: values.new_password })}>
        <Form.Item name="new_password" label="New password"
          rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}>
          <Input.Password placeholder="Enter new password" />
        </Form.Item>
        <Form.Item name="confirm" label="Confirm password" dependencies={['new_password']} rules={[
          { required: true, message: 'Repeat the new password' },
          ({ getFieldValue }) => ({
            validator(_, value) {
              if (!value || getFieldValue('new_password') === value) return Promise.resolve()
              return Promise.reject(new Error('Passwords do not match'))
            },
          }),
        ]}>
          <Input.Password placeholder="Confirm new password" />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={passwordMutation.isPending}>Reset password</Button>
        </div>
      </Form>
    </Modal>

    <Modal open={messageOpen} onCancel={() => setMessageOpen(false)} title="Send message"
      footer={null} width={470} destroyOnClose>
      <p className="modal-intro">Sends an in-app message to every guardian of this student that has a portal login.</p>
      <Form form={messageForm} layout="vertical" className="student-form"
        onFinish={values => messageMutation.mutate(values)}>
        <Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
          <Input placeholder="Half-term notice" />
        </Form.Item>
        <Form.Item name="body" label="Message" rules={[{ required: true, message: 'Write the message' }]}>
          <Input.TextArea rows={4} placeholder="Write your message…" />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setMessageOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" icon={<SendOutlined />}
            loading={messageMutation.isPending}>Send</Button>
        </div>
      </Form>
    </Modal>

    <Modal open={behaviorOpen} onCancel={() => setBehaviorOpen(false)} title="Add behaviour note"
      footer={null} width={520} destroyOnClose>
      <p className="modal-intro">Record a merit, demerit, incident, or observation on the student's record.</p>
      <Form form={behaviorForm} layout="vertical" className="student-form"
        initialValues={{ occurred_on: dayjs(), category: 'note', severity: 'low' }}
        onFinish={values => behaviorMutation.mutate({
          occurred_on: (values.occurred_on as Dayjs).format('YYYY-MM-DD'),
          category: values.category,
          severity: values.severity,
          title: values.title,
          description: values.description || null,
          action_taken: values.action_taken || null,
        })}>
        <div className="student-form-row">
          <div><Form.Item name="occurred_on" label="Date"><DatePicker className="student-date" /></Form.Item></div>
          <div><Form.Item name="category" label="Category">
            <Select options={Object.entries(behaviorMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
          </Form.Item></div>
        </div>
        <div className="student-form-row">
          <div><Form.Item name="severity" label="Severity">
            <Select options={Object.entries(severityMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
          </Form.Item></div>
          <div><Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Won the class quiz" /></Form.Item></div>
        </div>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="action_taken" label="Action taken"><Input placeholder="Guardian notified" /></Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setBehaviorOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={behaviorMutation.isPending}>Save note</Button>
        </div>
      </Form>
    </Modal>

    <Modal open={documentOpen} onCancel={() => setDocumentOpen(false)} title="File document"
      footer={null} width={500} destroyOnClose>
      <p className="modal-intro">Register a paper on file for this student (metadata only — files stay external).</p>
      <Form form={documentForm} layout="vertical" className="student-form"
        onFinish={values => documentMutation.mutate({
          doc_type: values.doc_type,
          title: values.title,
          reference: values.reference || null,
          issued_on: values.issued_on ? (values.issued_on as Dayjs).format('YYYY-MM-DD') : null,
          notes: values.notes || null,
        })}>
        <div className="student-form-row">
          <div><Form.Item name="doc_type" label="Document type" initialValue="other">
            <Select options={Object.entries(documentTypes).map(([value, label]) => ({ value, label }))} />
          </Form.Item></div>
          <div><Form.Item name="title" label="Title" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Birth certificate" /></Form.Item></div>
        </div>
        <div className="student-form-row">
          <div><Form.Item name="reference" label="Reference"><Input placeholder="BC-ADM-001" /></Form.Item></div>
          <div><Form.Item name="issued_on" label="Issued on"><DatePicker className="student-date" /></Form.Item></div>
        </div>
        <Form.Item name="notes" label="Notes"><Input.TextArea rows={3} /></Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setDocumentOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={documentMutation.isPending}>File document</Button>
        </div>
      </Form>
    </Modal>

    <Modal open={Boolean(guardianEdit)} onCancel={() => setGuardianEdit(null)} title="Edit guardian"
      footer={null} width={470} destroyOnClose>
      <p className="modal-intro">Update the contact details shown in Guardian Information.</p>
      <Form form={guardianForm} layout="vertical" className="student-form"
        initialValues={{
          first_name: guardianEdit ? guardianEdit.full_name.split(' ')[0] : '',
          last_name: guardianEdit ? guardianEdit.full_name.split(' ').slice(1).join(' ') : '',
          relationship: guardianEdit?.relationship ?? undefined,
          phone: guardianEdit?.phone ?? '',
          email: guardianEdit?.email ?? '',
        }}
        onFinish={values => guardianMutation.mutate({
          first_name: values.first_name,
          last_name: values.last_name,
          relationship: values.relationship || null,
          phone: values.phone || null,
          email: values.email || null,
        })}>
        <div className="student-form-row">
          <div><Form.Item name="first_name" label="First name" rules={[{ required: true, message: 'Required' }]}>
            <Input /></Form.Item></div>
          <div><Form.Item name="last_name" label="Last name" rules={[{ required: true, message: 'Required' }]}>
            <Input /></Form.Item></div>
        </div>
        <div className="student-form-row">
          <div><Form.Item name="relationship" label="Relationship">
            <Select allowClear options={[
              { value: 'Mother', label: 'Mother' }, { value: 'Father', label: 'Father' },
              { value: 'Guardian', label: 'Guardian' },
            ]} placeholder="Select" /></Form.Item></div>
          <div><Form.Item name="phone" label="Phone"><Input placeholder="+233 …" /></Form.Item></div>
        </div>
        <Form.Item name="email" label="Email" rules={[{ type: 'email', message: 'Not a valid email' }]}>
          <Input placeholder="parent@example.com" />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setGuardianEdit(null)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={guardianMutation.isPending}>Save guardian</Button>
        </div>
      </Form>
    </Modal>
  </div>
}

function ordinal(position: number) {
  const mod100 = position % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  return position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th'
}
