import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Spin, Tag, message } from 'antd'
import { CalendarOutlined, CreditCardOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import type { Overview, SchoolUser } from '../../shared/api/types'
import { fetchOverview, seedDemoFees } from './overviewApi'
import { fetchStudentSupport } from '../student-support/studentSupportApi'
import TeacherDashboard from './TeacherDashboard'
import { DonutChart, WeeklyBarChart } from './DashboardCharts'

const REFRESH_MS = 60_000

function greetingFor(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function money(value: string | number) {
  return Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Scale a series into 0–100 bar heights, staying flat when every value matches. */
function barHeights(values: number[]): number[] {
  const finite = values.filter(value => Number.isFinite(value))
  if (!finite.length) return []
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  if (max === min) return values.map(() => 60)
  return values.map(value => (Number.isFinite(value) ? 12 + ((value - min) / (max - min)) * 88 : 12))
}

/** Map each value to a point in the 700×210 chart box. */
function pointsFor(values: number[], span: [number, number]): string {
  const [low, high] = span
  // A constant series has no range to scale against; centre it so it does not
  // read as zero when every week is genuinely identical.
  const flat = high === low
  const range = flat ? 1 : high - low
  const usable = Math.max(values.length - 1, 1)
  return values.map((value, index) => {
    const x = (index / usable) * 700
    const ratio = flat ? 0.5 : (value - low) / range
    const y = 200 - ratio * 180
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
}

type LessonState = 'done' | 'live' | 'upcoming'

function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export default function Overview({ user }: { user: SchoolUser }) {
  return user.role === 'teacher' ? <TeacherDashboard user={user} /> : <AdminOverview user={user} />
}

function AdminOverview({ user }: { user: SchoolUser }) {
  const { accessToken } = useAuth()
  const { yearId, termId, loading: periodLoading } = useAcademicPeriod()
  const [now, setNow] = useState(() => new Date())

  // The page stays honest as the clock moves: lesson states tick with it.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const query = useQuery({
    queryKey: ['overview', user.school_id, yearId, termId],
    queryFn: () => fetchOverview(accessToken!, yearId, termId),
    enabled: !!accessToken && !periodLoading,
    refetchInterval: REFRESH_MS,
  })
  const supportQuery = useQuery({
    queryKey: ['student-support', user.school_id, yearId, termId],
    queryFn: () => fetchStudentSupport(accessToken!, yearId, termId || undefined),
    enabled: !!accessToken && !periodLoading && ['school_admin', 'principal', 'registrar', 'teacher', 'staff'].includes(user.role),
    refetchInterval: REFRESH_MS,
  })
  const data = query.data
  const supportReviewCount = (supportQuery.data?.urgent_review ?? 0) + (supportQuery.data?.follow_up ?? 0)

  const seedMutation = useMutation({
    mutationFn: () => seedDemoFees(accessToken!),
    onSuccess: result => {
      const parts: string[] = []
      if (result.invoices_created) parts.push(`${result.invoices_created} invoice${result.invoices_created === 1 ? '' : 's'}`)
      if (result.payments_created) parts.push(`${result.payments_created} payment${result.payments_created === 1 ? '' : 's'}`)
      if (result.attendance_records_created) parts.push(`${result.attendance_records_created} attendance records`)
      if (result.results_created) parts.push(`${result.results_created} term results`)
      if (result.class_teachers_set) parts.push(`${result.class_teachers_set} class teacher assignment${result.class_teachers_set === 1 ? '' : 's'}`)
      if (result.calendar_events_created) parts.push(`${result.calendar_events_created} academic calendar events`)
      if (parts.length) message.success(`Demo data created: ${parts.join(', ')}`)
      else message.info('Demo data is already generated')
      void query.refetch()
    },
    onError: error => message.error(formatApiError(error)),
  })

  // Admins can (re)run the idempotent demo seeding at any time.
  const canSeedDemo = user.role === 'school_admin'

  const lessons = useMemo(() => {
    const current = now.getHours() * 60 + now.getMinutes()
    return (data?.lessons_today ?? []).map(lesson => {
      const state: LessonState = current > minutesOf(lesson.ends_at) ? 'done'
        : current >= minutesOf(lesson.starts_at) ? 'live' : 'upcoming'
      return { ...lesson, state }
    })
  }, [data?.lessons_today, now])

  const firstName = user.display_name.trim().split(/\s+/)[0]
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const updatedLabel = data
    ? `${Math.max(0, Math.round((now.getTime() - new Date(data.generated_at).getTime()) / 1000))}s ago`
    : '—'

  const stats = useMemo(() => {
    if (!data) return []
    const activity = data.activity
    const studentSeries = activity.map(point => point.students)
    const attendanceSeries = activity.map(point => point.attendance_rate ?? 0)
    const paymentSeries = activity.map(point => Number(point.payments))
    const studentChange = studentSeries.length > 1 ? studentSeries[studentSeries.length - 1] - studentSeries[0] : 0

    const items = [
      {
        name: 'Total students', value: data.students_total.toLocaleString(),
        delta: studentChange === 0 ? 'No change' : `${studentChange > 0 ? '+' : ''}${studentChange}`,
        note: `since ${activity.length ? new Date(activity[0].week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'earlier'}`,
        icon: <TeamOutlined />, color: 'blue', bars: barHeights(studentSeries),
      },
      {
        name: termId ? `Attendance · ${data.current_term?.name ?? 'Term'}` : 'Attendance today',
        value: data.attendance?.rate_percent != null ? `${data.attendance.rate_percent}%` : '—',
        delta: data.attendance?.records_total ? `${data.attendance.present + data.attendance.late}/${data.attendance.records_total} marked` : 'Not marked yet',
        note: data.attendance ? termId
          ? `${data.attendance.sessions_submitted} class sessions recorded`
          : `${data.attendance.sessions_submitted} of ${data.attendance.lessons_today} lessons` : '',
        icon: <CalendarOutlined />, color: 'green', bars: barHeights(attendanceSeries),
      },
    ]

    if (data.finance) {
      items.push({
        name: 'Fees collected', value: `₵ ${money(data.finance.paid_total)}`,
        delta: data.finance.overdue_invoice_count ? `${data.finance.overdue_invoice_count} overdue` : 'All current',
        note: `₵ ${money(data.finance.outstanding_total)} outstanding`,
        icon: <CreditCardOutlined />, color: 'purple', bars: barHeights(paymentSeries),
      })
    } else {
      items.push({
        name: 'Class groups', value: data.classes_total.toLocaleString(),
        delta: 'Active', note: `for ${data.current_term?.academic_year ?? 'the selected year'}`,
        icon: <CalendarOutlined />, color: 'purple', bars: barHeights([]),
      })
    }

    items.push({
      name: 'Teaching staff', value: data.teachers_total.toLocaleString(),
      delta: data.teachers_total > 0 ? 'Active' : 'None yet',
      note: data.teachers_total === 1 ? '1 teacher' : `${data.teachers_total} teachers`,
      icon: <UserOutlined />, color: 'orange', bars: barHeights([]),
    })
    return items
  }, [data, termId])

  const chart = useMemo(() => {
    const activity = data?.activity ?? []
    const studentValues = activity.map(point => point.students)
    const attendanceValues = activity.map(point => point.attendance_rate).filter((value): value is number => value != null)
    const hasStudents = studentValues.some(value => value > 0)
    const hasAttendance = attendanceValues.length > 0
    return { activity, studentValues, attendanceValues, hasStudents, hasAttendance }
  }, [data?.activity])

  if (query.isLoading) {
    return <div className="page-content"><div className="attendance-loading"><Spin size="large" /><span>Loading your school overview…</span></div></div>
  }

  if (query.isError) {
    return <div className="page-content">
      <Alert type="error" showIcon message="Could not load the dashboard" description={formatApiError(query.error)}
        action={<Button size="small" onClick={() => void query.refetch()}>Retry</Button>} />
    </div>
  }

  if (!data) return null

  return <div className="page-content">
    <div className="welcome-row">
      <div>
        <div className="eyebrow">SCHOOL OVERVIEW <span className="live-dot" /> <span className="term-label">
          {data.current_term ? data.current_term.name.toUpperCase() : 'NO TERM SET'}
        </span></div>
        <h1>{greetingFor(now)}, {firstName} <span className="wave">✳</span></h1>
        <p className="welcome-subtitle">Here’s what’s happening at your school today.</p>
        <p className="demo-note">Live data · refreshed automatically · updated {updatedLabel}</p>
      </div>
      <div className="welcome-actions">
        {canSeedDemo && <Button className="outline-button"
          loading={seedMutation.isPending} onClick={() => seedMutation.mutate()}>
          Generate demo data
        </Button>}
        <Link to="/classes"><Button className="outline-button">Manage academics <span>↗</span></Button></Link>
      </div>
    </div>

    <section className="stats-grid" aria-label="School summary">
      {stats.map(item => <article className="stat-card" key={item.name}>
        <div className="stat-top"><span>{item.name}</span><div className={`stat-icon ${item.color}`}>{item.icon}</div></div>
        <div className="stat-value">{item.value}</div>
        <div className="stat-foot">
          <span className="delta">{item.delta}</span>
          <span>{item.note}</span>
          {item.bars.length > 0 && <div className={`mini-chart ${item.color}`} aria-hidden="true">
            {item.bars.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}
          </div>}
        </div>
      </article>)}
    </section>

    {['school_admin', 'principal', 'registrar', 'teacher', 'staff'].includes(user.role) && supportQuery.data && <section className="overview-support-alert" aria-label="Early student support">
      <div className="overview-support-icon"><span>✦</span></div>
      <div className="overview-support-copy"><strong>{supportReviewCount ? `${supportReviewCount} students may benefit from an early check-in` : supportQuery.data.monitor ? `No follow-ups needed; ${supportQuery.data.monitor} student${supportQuery.data.monitor === 1 ? '' : 's'} to monitor` : 'No students currently need an early support review'}</strong><span>{supportQuery.data.urgent_review} priority reviews · {supportQuery.data.follow_up} follow-ups · {supportQuery.data.monitor} to monitor in {supportQuery.data.term_name ?? supportQuery.data.academic_year_name}. Signals are prompts for staff review, not predictions.</span></div>
      <Link to="/student-support"><Button type="primary">Review support signals</Button></Link>
    </section>}

    <div className="content-grid">
      <section className="panel activity-panel">
        <div className="panel-heading">
          <div><h2>School activity</h2><p>Enrolment and attendance, last {chart.activity.length} weeks</p></div>
          <span className="select-button" aria-live="polite">Weekly <span>⌄</span></span>
        </div>
        {chart.hasStudents || chart.hasAttendance ? <>
          <div className="chart-legend">
            <span><i className="legend-students" /> Students</span>
            <span><i className="legend-attendance" /> Attendance</span>
          </div>
          <div className="chart-area">
            <div className="axis-labels"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
            <div className="chart">
              <div className="gridline g1" /><div className="gridline g2" /><div className="gridline g3" /><div className="gridline g4" />
              <svg viewBox="0 0 700 210" preserveAspectRatio="none" role="img"
                aria-label="Students enrolled and weekly attendance rate">
                <defs>
                  <linearGradient id="fillBlue" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#6984f1" stopOpacity=".18" />
                    <stop offset="100%" stopColor="#6984f1" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {chart.studentValues.length > 1 && <>
                  <path d={`${pointsFor(chart.studentValues, [Math.min(...chart.studentValues), Math.max(...chart.studentValues)])} L700 210 L0 210Z`} fill="url(#fillBlue)" />
                  <path d={pointsFor(chart.studentValues, [Math.min(...chart.studentValues), Math.max(...chart.studentValues)])}
                    fill="none" stroke="#5572e8" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                </>}
                {chart.attendanceValues.length > 1 &&
                  <path d={pointsFor(chart.attendanceValues, [0, 100])} fill="none" stroke="#59bca5"
                    strokeWidth="2.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
              </svg>
              <div className="x-labels">
                {chart.activity.map(point => <span key={point.week_start}>
                  {new Date(point.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>)}
              </div>
            </div>
          </div>
        </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No enrolment or attendance recorded yet" />}
      </section>

      <section className="panel events-panel">
        <div className="panel-heading">
          <div><h2>Today at a glance</h2><p>{dateLabel}</p></div>
          <span className="dots-button" aria-hidden="true">···</span>
        </div>
        {lessons.length ? <div className="event-list">
          {lessons.map(lesson => <div className="event-item" key={lesson.id}>
            <div className="event-time">{lesson.starts_at}</div>
            <div className={`event-marker ${lesson.state === 'live' ? 'violet-marker' : lesson.state === 'done' ? 'blue-marker' : 'mint-marker'}`} />
            <div><strong>{lesson.subject_name} · {lesson.class_name}</strong>
              <span>{lesson.room ? `${lesson.room} · ` : ''}{lesson.teacher_name}</span></div>
            <span className={`event-state ${lesson.state === 'live' ? 'live' : lesson.state === 'done' ? 'done' : ''}`}>
              {lesson.state === 'live' ? 'In progress' : lesson.state === 'done' ? 'Done' : `Ends ${lesson.ends_at}`}
            </span>
          </div>)}
        </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lessons scheduled for today" />}
        <Link to="/classes" className="all-events">View full timetable <span>→</span></Link>
      </section>
    </div>

    <section className="dashboard-chart-grid" aria-label="School performance charts">
      <WeeklyBarChart
        title={data.finance ? 'Weekly fee collections' : 'Weekly student enrolment'}
        subtitle={data.finance ? 'Payments received over the last weeks' : 'Enrolled student totals over the last weeks'}
        values={data.activity.map(point => ({
          label: new Date(point.week_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          value: data.finance ? Number(point.payments) : point.students,
        }))}
        formatValue={value => data.finance ? `₵${money(value)}` : value.toLocaleString()}
      />
      <DonutChart
        title="Attendance breakdown"
        subtitle="Recorded attendance for the selected period"
        segments={[
          { label: 'Present', value: data.attendance?.present ?? 0, color: '#21b68a' },
          { label: 'Late', value: data.attendance?.late ?? 0, color: '#f0ad4e' },
          { label: 'Absent', value: data.attendance?.absent ?? 0, color: '#ed6a72' },
          { label: 'Excused', value: data.attendance?.excused ?? 0, color: '#6280ef' },
        ]}
        centerValue={data.attendance?.rate_percent == null ? '—' : `${data.attendance.rate_percent}%`}
        centerLabel="attendance"
      />
      {data.finance && <DonutChart
        title="Fee collection status"
        subtitle="Paid and outstanding invoice balances"
        segments={[
          { label: 'Collected', value: Number(data.finance.paid_total), color: '#21b68a' },
          { label: 'Outstanding', value: Number(data.finance.outstanding_total), color: '#f0ad4e' },
        ]}
        centerValue={`₵${money(data.finance.invoiced_total)}`}
        centerLabel="invoiced"
      />}
    </section>

    <section className="panel attention-panel">
      <div className="panel-heading">
        <div><h2>Needs your attention {data.attention.length > 0 && <Tag variant="filled" className="attention-count">
          {data.attention.length} {data.attention.length === 1 ? 'item' : 'items'}
        </Tag>}</h2><p>Items that may need a follow-up today</p></div>
      </div>
      {data.attention.length ? <div className="attention-list">
        {data.attention.map(item => <div className="attention-item" key={item.key}>
          <div className={`attention-icon ${item.kind === 'finance' ? 'amber-bg' : item.kind === 'attendance' ? 'rose-bg' : 'blue-bg'}`}>
            {item.kind === 'finance' ? '₵' : item.kind === 'attendance' ? '!' : '↗'}
          </div>
          <div className="attention-text"><strong>{item.title}</strong><span>{item.detail}</span></div>
          <span className="attention-meta">{item.meta}</span>
          <Link to={item.to} aria-label={item.title}>→</Link>
        </div>)}
      </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={data.attention.length === 0 ? 'Nothing needs attention right now' : 'No items'} />}
    </section>
  </div>
}
