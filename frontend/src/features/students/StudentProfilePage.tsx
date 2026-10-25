import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Spin, Tabs, Tag } from 'antd'
import { ArrowLeftOutlined, PrinterOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { fetchStudentProfile } from './studentsApi'

const statusColors: Record<string, string> = {
  active: 'green', transferred: 'blue', graduated: 'purple', withdrawn: 'default',
}

const barColors: Record<string, string> = {
  present: '#45b894', late: '#e6a750', absent: '#e0645c', excused: '#6580e9',
}

// Illustrations downloaded from DiceBear's open-source Notionists style.
const AVATAR_FILES = ['Selorm.svg', 'Afua.svg', 'Kwesi.svg', 'Ama.svg', 'Kojo.svg', 'Naa.svg']

/** Monochrome Tabler outline icon, tinted by the surrounding text colour. */
function ProfileIcon({ name }: { name: string }) {
  const url = `/profile/icons/${name}.svg`
  return <span className="profile-icon" aria-hidden="true"
    style={{ WebkitMaskImage: `url(${url})`, maskImage: `url(${url})` }} />
}

function invoiceTag(status: string) {
  if (status === 'paid') return { color: 'green', label: 'Paid' }
  if (status === 'partially_paid') return { color: 'gold', label: 'Partial' }
  return { color: 'red', label: 'Pending' }
}

function money(value: string | number) {
  return Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatCard({ name, value, delta, note, color }: {
  name: string; value: string; delta: string; note: string; color: string
}) {
  return <article className="stat-card">
    <div className="stat-top"><span>{name}</span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-foot"><span className="delta">{delta}</span><span>{note}</span></div>
    <div className={`stat-accent ${color}`} aria-hidden="true" />
  </article>
}

export default function StudentProfilePage() {
  const { studentId } = useParams<{ studentId: string }>()
  const { accessToken, user } = useAuth()
  const [tab, setTab] = useState('overview')

  const query = useQuery({
    queryKey: ['student-profile', studentId],
    queryFn: () => fetchStudentProfile(accessToken!, studentId!),
    enabled: Boolean(accessToken && studentId),
  })
  const data = query.data

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

  const { student, enrollment, guardians, attendance, finance, results, schedule_today } = data
  const primaryGuardian = guardians.find(item => item.is_primary) ?? guardians[0]
  const openInvoices = (finance?.invoices ?? []).filter(item => item.status !== 'paid')
  const attended = attendance ? attendance.present + attendance.late : 0
  // Stable per-student pick so the same student always gets the same avatar.
  const avatarFile = AVATAR_FILES[
    [...student.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_FILES.length
  ]

  const factRow = [
    { icon: 'cake', label: 'Date of birth', value: student.date_of_birth
        ? `${dayjs(student.date_of_birth).format('D MMM YYYY')}${student.age_years != null ? ` (${student.age_years} yrs)` : ''}`
        : '—' },
    { icon: 'users', label: 'Primary guardian', value: primaryGuardian ? primaryGuardian.full_name : 'Not linked' },
    { icon: 'phone', label: 'Guardian phone', value: primaryGuardian?.phone ?? '—' },
    { icon: 'calendar-event', label: 'Enrolled on', value: enrollment ? dayjs(enrollment.enrolled_on).format('D MMM YYYY') : 'Not enrolled' },
  ]

  const statCards = [
    { name: 'Current class', value: enrollment?.class_name ?? 'Not enrolled',
      delta: enrollment ? enrollment.grade_level : '—',
      note: enrollment ? enrollment.academic_year : 'no active enrolment', color: 'blue' },
    { name: 'Attendance (this term)',
      value: attendance?.rate_percent != null ? `${attendance.rate_percent}%` : '—',
      delta: attendance && attendance.days_marked ? `${attended}/${attendance.days_marked} days present` : 'Not marked yet',
      note: attendance?.days_marked ? 'present or late' : 'no records this term', color: 'green' },
  ]
  if (finance) {
    statCards.push({ name: 'Fees outstanding', value: `₵ ${money(finance.outstanding_total)}`,
      delta: openInvoices.length ? `${openInvoices.length} open` : 'All settled',
      note: `₵ ${money(finance.paid_total)} paid`, color: 'purple' })
  }
  if (averages) {
    statCards.push({ name: 'Overall average', value: `${averages.mean}%`,
      delta: results[results.length - 1]?.grade ?? '—',
      note: `across ${averages.count} term${averages.count === 1 ? '' : 's'}`, color: 'orange' })
  }

  const overviewTabs = [
    {
      key: 'overview', label: 'Overview',
      children: <>
        <section className="stats-grid profile-stats" aria-label="Student summary">
          {statCards.map(item => <StatCard key={item.name} {...item} />)}
        </section>
        <div className="profile-panels">
          <section className="panel profile-panel">
            <div className="panel-heading">
              <div><h2><ProfileIcon name="school" />Academic performance</h2><p>Latest computed term results</p></div>
              {results.length > 4 && <button type="button" className="see-all" onClick={() => setTab('history')}>View full history <span>→</span></button>}
            </div>
            {results.length ? <table className="profile-table">
              <thead><tr><th>TERM</th><th>YEAR</th><th>GRADE</th><th>SCORE</th><th>POSITION</th><th>STATUS</th></tr></thead>
              <tbody>{results.slice(-4).reverse().map(item => <tr key={item.term_id}>
                <td><strong>{item.term_name}</strong></td>
                <td>{item.academic_year}</td>
                <td>{item.grade ?? '—'}</td>
                <td>{Number(item.aggregate_percent)}%</td>
                <td>{item.position ? `${item.position}${ordinal(item.position)}` : '—'}</td>
                <td>{item.published ? <Tag color="green" variant="filled">Published</Tag> : <Tag variant="filled">Draft</Tag>}</td>
              </tr>)}</tbody>
            </table> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No term results computed yet" />}
          </section>
          <section className="panel profile-panel">
            <div className="panel-heading">
              <div><h2><ProfileIcon name="calendar-event" />Today’s class schedule</h2><p>{dayjs().format('dddd D MMMM')}</p></div>
              <Link to="/classes" className="see-all">Full timetable <span>→</span></Link>
            </div>
            {schedule_today.length ? <div className="profile-schedule">
              {schedule_today.map(lesson => <div className="schedule-row" key={`${lesson.starts_at}-${lesson.subject_code}`}>
                <span className="schedule-time">{lesson.starts_at} – {lesson.ends_at}</span>
                <span className="schedule-subject"><strong>{lesson.subject_name}</strong><small>{lesson.subject_code}</small></span>
                <span className="schedule-teacher">{lesson.teacher_name}</span>
                <span className="schedule-room">{lesson.room ?? '—'}</span>
              </div>)}
            </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lessons scheduled for this class today" />}
          </section>
        </div>
      </>,
    },
    {
      key: 'history', label: 'Academic history',
      children: <section className="panel profile-panel profile-table-panel">
        <div className="panel-heading"><div><h2>Academic history</h2><p>Every computed term result on record</p></div></div>
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
        <div className="panel-heading"><div><h2><ProfileIcon name="calendar-event" />Attendance</h2><p>Current term, with the last 30 days below</p></div></div>
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
      key: 'fees', label: 'Fees & payments',
      children: <section className="panel profile-panel profile-table-panel">
        <div className="panel-heading"><div><h2><ProfileIcon name="id-badge-2" />Fees & payments</h2><p>Invoices issued to this student</p></div>
          {finance && <span className="see-all" aria-hidden="true">₵ {money(finance.outstanding_total)} due</span>}</div>
        {!finance ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Fee details are visible to finance roles only" />
          : finance.invoices.length ? <table className="profile-table">
            <thead><tr><th>INVOICE</th><th>TERM</th><th>AMOUNT</th><th>PAID</th><th>BALANCE</th><th>STATUS</th><th>ISSUED</th></tr></thead>
            <tbody>{finance.invoices.map(invoice => {
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
      </section>,
    },
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
            </div>
            <div className="profile-subline">
              <span>{student.admission_number}</span>
              {enrollment && <><span className="dot">·</span><span>{enrollment.class_name}</span></>}
              <span className="dot">·</span><span>{user?.school_name}</span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <Button icon={<PrinterOutlined />} onClick={() => window.print()}>Print profile</Button>
        </div>
      </div>
      <div className="profile-facts">
        {factRow.map(fact => <div className="profile-fact" key={fact.label}>
          <span className="profile-fact-label"><ProfileIcon name={fact.icon} />{fact.label}</span>
          <strong>{fact.value}</strong>
        </div>)}
      </div>
    </section>

    <div className="profile-grid">
      <div className="profile-main">
        <Tabs activeKey={tab} onChange={setTab} items={overviewTabs} />
      </div>
      <aside className="profile-aside">
        <section className="side-card">
          <div className="side-card-head"><h3><ProfileIcon name="shield-check" />Student status</h3>
            <Tag color={statusColors[student.status] ?? 'default'} variant="filled">{student.status}</Tag></div>
          <p className="side-note">{enrollment
            ? `Enrolled on ${dayjs(enrollment.enrolled_on).format('D MMM YYYY')}`
            : 'No active enrolment on record'}</p>
        </section>
        <section className="side-card">
          <div className="side-card-head"><h3><ProfileIcon name="id-badge-2" />Quick information</h3></div>
          <dl className="quick-list">
            <div><dt>Class</dt><dd>{enrollment?.class_name ?? '—'}</dd></div>
            <div><dt>Stream</dt><dd>{enrollment?.stream ?? '—'}</dd></div>
            <div><dt>Roll number</dt><dd>{student.admission_number}</dd></div>
            <div><dt>Year group</dt><dd>{enrollment?.grade_level ?? '—'}</dd></div>
            <div><dt>Academic year</dt><dd>{enrollment?.academic_year ?? '—'}</dd></div>
          </dl>
        </section>
        <section className="side-card">
          <div className="side-card-head"><h3><ProfileIcon name="users" />Guardian information</h3></div>
          {guardians.length ? <div className="guardian-list">
            {guardians.map(guardian => <div className="guardian-row" key={guardian.guardian_id}>
              <strong>{guardian.full_name} <small>({guardian.relationship})</small></strong>
              {guardian.phone && <span>{guardian.phone}</span>}
              {guardian.email && <span>{guardian.email}</span>}
            </div>)}
          </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No guardians linked yet" />}
        </section>
      </aside>
    </div>
  </div>
}

function ordinal(position: number) {
  const mod100 = position % 100
  if (mod100 >= 11 && mod100 <= 13) return 'th'
  return position % 10 === 1 ? 'st' : position % 10 === 2 ? 'nd' : position % 10 === 3 ? 'rd' : 'th'
}
