import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Spin } from 'antd'
import {
  AppstoreOutlined, BarChartOutlined, BookOutlined, CalendarOutlined,
  CreditCardOutlined, FileTextOutlined, SyncOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { fetchOverview } from '../overview/overviewApi'
import { fetchFinanceSummary } from '../finance/financeApi'
import { fetchStudents } from '../students/studentsApi'

function amount(value?: string | number | null) {
  if (value == null) return '—'
  return `₵ ${Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const reports = [
  { title: 'Student directory', description: 'Review student enrollment, class placement, and guardian information.', category: 'PEOPLE', icon: <TeamOutlined/>, tone: 'blue', href: '/students', action: 'Open students' },
  { title: 'Attendance register', description: 'Review class attendance records and daily attendance activity.', category: 'SCHOOL OPERATIONS', icon: <CalendarOutlined/>, tone: 'green', href: '/attendance', action: 'Open attendance' },
  { title: 'Term results', description: 'View class performance, publication status, and student results.', category: 'ACADEMICS', icon: <BarChartOutlined/>, tone: 'purple', href: '/results', action: 'Open results' },
  { title: 'Assessment gradebook', description: 'Review assessment scores and completion across classes.', category: 'ACADEMICS', icon: <BookOutlined/>, tone: 'orange', href: '/assessments', action: 'Open gradebook' },
  { title: 'Fees and payments', description: 'Review invoices, collections, balances, and payment activity.', category: 'FINANCE', icon: <CreditCardOutlined/>, tone: 'blue', href: '/finance', action: 'Open finance' },
  { title: 'Academic calendar', description: 'See term dates, school events, holidays, and examination dates.', category: 'SCHOOL OPERATIONS', icon: <AppstoreOutlined/>, tone: 'green', href: '/academic-calendar', action: 'Open calendar' },
]

export default function ReportsPage() {
  const { accessToken, user } = useAuth()
  const { yearId, termId, years, terms, loading } = useAcademicPeriod()
  const enabled = !!accessToken && !loading
  const overview = useQuery({ queryKey: ['report-overview', user?.school_id, yearId, termId], queryFn: () => fetchOverview(accessToken!, yearId, termId), enabled })
  const finance = useQuery({ queryKey: ['report-finance', user?.school_id, termId], queryFn: () => fetchFinanceSummary(accessToken!, termId || undefined), enabled: enabled && ['school_admin', 'principal', 'finance'].includes(user?.role ?? '') })
  const students = useQuery({ queryKey: ['report-student-count', user?.school_id, yearId], queryFn: () => fetchStudents(accessToken!, 1, '', undefined, yearId || undefined), enabled })
  const yearName = years.find(item => item.id === yearId)?.name ?? 'Current academic year'
  const termName = terms.find(item => item.id === termId)?.name
  const metrics = [
    { label: 'Students in view', value: students.data?.total.toLocaleString() ?? '—', note: yearName, icon: <TeamOutlined/>, tone: 'blue' },
    { label: 'Attendance rate', value: overview.data?.attendance?.rate_percent == null ? '—' : `${overview.data.attendance.rate_percent}%`, note: termName ?? 'Selected period', icon: <CalendarOutlined/>, tone: 'green' },
    ...(finance.isEnabled ? [
      { label: 'Fees collected', value: amount(finance.data?.paid_total), note: termName ?? 'Selected period', icon: <CreditCardOutlined/>, tone: 'purple' },
      { label: 'Outstanding', value: amount(finance.data?.outstanding_total), note: 'Fee balances', icon: <FileTextOutlined/>, tone: 'orange' },
    ] : []),
  ]
  const pageError = overview.error ?? students.error ?? finance.error

  return <div className="page-content report-page">
    <div className="report-heading"><div><div className="eyebrow">SCHOOL WORKSPACE · INSIGHTS</div><h1>Reports</h1><p className="welcome-subtitle">Explore live school records and academic performance for the selected period.</p></div></div>
    <section className="report-summary panel"><div className="report-summary-copy"><span className="report-summary-icon"><FileTextOutlined/></span><div><span className="eyebrow">REPORTING PERIOD</span><h2>{termName ? `${yearName} · ${termName}` : yearName}</h2><p>Change the academic year or term using the selectors in the top bar. Report links open their live, school-scoped data.</p></div></div><div className="report-summary-action"><span><SyncOutlined/> Live school data</span><Link to="/"><Button>School overview <span aria-hidden="true">↗</span></Button></Link></div></section>
    {pageError && <Alert className="reports-error" type="error" showIcon message="Some report totals could not be loaded" description={formatApiError(pageError)} action={<Button size="small" onClick={() => { void overview.refetch(); void students.refetch(); void finance.refetch() }}>Retry</Button>}/>}
    {(overview.isLoading || students.isLoading || finance.isLoading) && <div className="reports-loading"><Spin/><span>Loading live report totals…</span></div>}
    <section className="reports-metrics" aria-label="Selected period totals">{metrics.map(metric => <article className="report-metric" key={metric.label}><span className={`report-metric-icon ${metric.tone}`}>{metric.icon}</span><div><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></div></article>)}</section>
    <div className="reports-section-heading"><div><h2>Report library</h2><p>Choose an area to explore its detailed records and reports.</p></div><span>{reports.length} live destinations</span></div>
    <section className="reports-grid" aria-label="Available reports">{reports.filter(report => report.href !== '/finance' || ['school_admin', 'principal', 'finance'].includes(user?.role ?? '')).map(report => <article className="report-card" key={report.title}><div className="report-card-top"><span className={`report-card-icon ${report.tone}`}>{report.icon}</span><span className="report-category">{report.category}</span></div><h3>{report.title}</h3><p>{report.description}</p><Link to={report.href}>{report.action}<span aria-hidden="true"> →</span></Link></article>)}</section>
  </div>
}
