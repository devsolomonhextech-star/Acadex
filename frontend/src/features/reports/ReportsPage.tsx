import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Spin } from 'antd'
import {
  AppstoreOutlined, ArrowUpOutlined, BarChartOutlined, BookOutlined, CalendarOutlined,
  CreditCardOutlined, DownloadOutlined, FileTextOutlined, SyncOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { fetchOverview } from '../overview/overviewApi'
import { fetchFinanceSummary } from '../finance/financeApi'
import { fetchStudents } from '../students/studentsApi'

function amount(value?: string | number | null) {
  if (value == null) return '—'
  return `GH₵ ${Number(value).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function compactAmount(value: number) {
  if (value >= 1000) return `₵${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return `₵${Math.round(value)}`
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
  const canViewFinance = ['school_admin', 'principal', 'finance'].includes(user?.role ?? '')
  const overview = useQuery({ queryKey: ['report-overview', user?.school_id, yearId, termId], queryFn: () => fetchOverview(accessToken!, yearId, termId), enabled })
  const finance = useQuery({ queryKey: ['report-finance', user?.school_id, yearId, termId], queryFn: () => fetchFinanceSummary(accessToken!, termId || undefined), enabled: enabled && canViewFinance })
  const students = useQuery({ queryKey: ['report-student-count', user?.school_id, yearId], queryFn: () => fetchStudents(accessToken!, 1, '', undefined, yearId || undefined), enabled })
  const yearName = years.find(item => item.id === yearId)?.name ?? 'Current academic year'
  const termName = terms.find(item => item.id === termId)?.name
  const activity = overview.data?.activity ?? []
  const financeSummary = finance.data
  const invoiced = Number(financeSummary?.invoiced_total ?? 0)
  const collected = Number(financeSummary?.paid_total ?? 0)
  const collectionRate = invoiced > 0 ? Math.min(100, Math.round((collected / invoiced) * 100)) : 0
  const paymentValues = activity.map(point => Number(point.payments)).filter(Number.isFinite)
  const maxPayment = Math.max(...paymentValues, 1)
  const hasActivity = activity.some(point => point.students > 0 || point.attendance_rate != null || Number(point.payments) > 0)
  const pageError = overview.error ?? students.error ?? finance.error
  const isLoading = overview.isLoading || students.isLoading || finance.isLoading

  const exportSummary = () => {
    const rows = [
      ['School report summary', user?.school_name ?? 'School'],
      ['Academic year', yearName], ['Term', termName ?? 'All terms'],
      ['Students', String(students.data?.total ?? '')],
      ['Attendance rate', overview.data?.attendance?.rate_percent == null ? '' : `${overview.data.attendance.rate_percent}%`],
      ...(canViewFinance ? [['Fees invoiced', financeSummary?.invoiced_total ?? ''], ['Fees collected', financeSummary?.paid_total ?? ''], ['Outstanding fees', financeSummary?.outstanding_total ?? '']] : []),
    ]
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `school-report-${yearName.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const metrics = [
    { label: 'Enrolled students', value: students.data?.total.toLocaleString() ?? '—', note: yearName, icon: <TeamOutlined/>, tone: 'blue' },
    { label: 'Attendance rate', value: overview.data?.attendance?.rate_percent == null ? '—' : `${overview.data.attendance.rate_percent}%`, note: termName ?? 'Selected period', icon: <CalendarOutlined/>, tone: 'green' },
    ...(canViewFinance ? [
      { label: 'Fees collected', value: amount(financeSummary?.paid_total), note: `${collectionRate}% of invoiced fees`, icon: <CreditCardOutlined/>, tone: 'purple' },
      { label: 'Outstanding fees', value: amount(financeSummary?.outstanding_total), note: `${financeSummary?.open_invoice_count ?? 0} open invoices`, icon: <FileTextOutlined/>, tone: 'orange' },
    ] : []),
  ]

  return <div className="page-content report-page">
    <div className="report-heading">
      <div><div className="eyebrow">SCHOOL WORKSPACE · INSIGHTS</div><h1>Reports & analytics</h1><p className="welcome-subtitle">A clear view of school performance, enrollment, attendance, and finances.</p></div>
      <Button className="report-export" icon={<DownloadOutlined/>} onClick={exportSummary} disabled={isLoading}>Export summary</Button>
    </div>
    <section className="report-summary panel">
      <div className="report-summary-copy"><span className="report-summary-icon"><FileTextOutlined/></span><div><span className="eyebrow">REPORTING PERIOD</span><h2>{termName ? `${yearName} · ${termName}` : yearName}</h2><p>Use the academic year and term selectors in the top bar to compare historical periods. All figures below come from this school’s records.</p></div></div>
      <div className="report-summary-action"><span><SyncOutlined/> Live school data</span><small>School-wide · {termName ?? 'All terms'}</small></div>
    </section>
    {pageError && <Alert className="reports-error" type="error" showIcon message="Some report totals could not be loaded" description={formatApiError(pageError)} action={<Button size="small" onClick={() => { void overview.refetch(); void students.refetch(); void finance.refetch() }}>Retry</Button>}/>}
    {isLoading && <div className="reports-loading"><Spin/><span>Loading live school analytics…</span></div>}
    {!isLoading && <section className="reports-metrics" aria-label="Selected period totals">{metrics.map(metric => <article className="report-metric" key={metric.label}><span className={`report-metric-icon ${metric.tone}`}>{metric.icon}</span><div><small>{metric.label}</small><strong>{metric.value}</strong><span>{metric.note}</span></div></article>)}</section>}

    <div className="reports-analysis-heading"><div><span className="eyebrow">PERFORMANCE SNAPSHOT</span><h2>School at a glance</h2><p>Key movements across enrollment, attendance, and fee collection.</p></div><span className="report-period-chip">{termName ? `${yearName} · ${termName}` : yearName}</span></div>
    <section className="reports-analysis" aria-label="School performance analysis">
      <article className="report-chart-card report-trend-card">
        <div className="report-chart-heading"><div><h3>Enrollment & attendance</h3><p>Weekly school activity in the selected period</p></div><span className="report-chart-badge"><span className="report-dot blue-dot"/>Live</span></div>
        {hasActivity ? <>
          <div className="report-chart-legend"><span><i className="report-dot blue-dot"/> Enrollment</span><span><i className="report-dot green-dot"/> Attendance</span></div>
          <div className="report-trend-wrap">
            <div className="report-axis"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
            <div className="report-trend-plot">
              {[0, 25, 50, 75, 100].map(line => <span className="report-gridline" style={{ top: `${line}%` }} key={line}/>)}
              <svg viewBox="0 0 700 200" preserveAspectRatio="none" role="img" aria-label="Weekly enrollment and attendance trend">
                <defs><linearGradient id="reportEnrollmentFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#5472e8" stopOpacity=".18"/><stop offset="100%" stopColor="#5472e8" stopOpacity="0"/></linearGradient></defs>
                {activity.length > 1 && (() => {
                  const values = activity.map(item => item.students)
                  const min = Math.min(...values), max = Math.max(...values), range = Math.max(max - min, 1)
                  const path = values.map((value, index) => `${index ? 'L' : 'M'}${index / (values.length - 1) * 700} ${180 - ((value - min) / range) * 150}`).join(' ')
                  return <><path d={`${path} L700 200 L0 200Z`} fill="url(#reportEnrollmentFill)"/><path d={path} fill="none" stroke="#5472e8" strokeWidth="3" vectorEffect="non-scaling-stroke"/></>
                })()}
                {activity.filter(point => point.attendance_rate != null).length > 1 && (() => {
                  const series = activity.map((item, index) => ({ item, index })).filter(point => point.item.attendance_rate != null)
                  const path = series.map(({ item, index }) => `${index ? 'L' : 'M'}${index / Math.max(activity.length - 1, 1) * 700} ${180 - (item.attendance_rate ?? 0) * 1.5}`).join(' ')
                  return <path d={path} fill="none" stroke="#45b391" strokeWidth="2.5" strokeDasharray="6 5" vectorEffect="non-scaling-stroke"/>
                })()}
              </svg>
              <div className="report-x-axis">{activity.map(point => <span key={point.week_start}>{new Date(`${point.week_start}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>)}</div>
            </div>
          </div>
          <div className="report-chart-foot"><span><strong>{overview.data?.students_total ?? 0}</strong> current students</span><span><strong>{overview.data?.attendance?.rate_percent ?? '—'}{overview.data?.attendance?.rate_percent != null ? '%' : ''}</strong> current attendance</span></div>
        </> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Activity will appear as enrollment and attendance records are added."/>}
      </article>

      {canViewFinance && <article className="report-chart-card report-finance-card">
        <div className="report-chart-heading"><div><h3>Fee collection</h3><p>Collected against invoiced fees</p></div><span className="report-chart-badge finance-badge">{collectionRate}% collected</span></div>
        <div className="report-collection-body">
          <div className="report-donut" role="img" aria-label={`${collectionRate} percent of fees collected`} style={{ background: `conic-gradient(#4f6ee5 ${collectionRate * 3.6}deg, #edf0f7 0deg)` }}><div><strong>{collectionRate}%</strong><span>collected</span></div></div>
          <div className="report-finance-legend"><div><i className="report-dot blue-dot"/><span>Collected</span><strong>{amount(financeSummary?.paid_total)}</strong></div><div><i className="report-dot pale-dot"/><span>Outstanding</span><strong>{amount(financeSummary?.outstanding_total)}</strong></div><div className="report-finance-total"><span>Total invoiced</span><strong>{amount(financeSummary?.invoiced_total)}</strong></div></div>
        </div>
        <div className="report-collection-progress"><span style={{ width: `${collectionRate}%` }}/></div>
        <div className="report-chart-foot"><span><strong>{financeSummary?.payments_total ?? '0'}</strong> recorded payments</span><Link to="/finance">View finance <span aria-hidden="true">→</span></Link></div>
      </article>}
    </section>

    {canViewFinance && <section className="report-chart-card report-payments-card">
      <div className="report-chart-heading"><div><h3>Payment activity</h3><p>Fees received across recent school weeks</p></div><Link to="/finance" className="report-inline-link">Full finance report <span aria-hidden="true">→</span></Link></div>
      {paymentValues.some(value => value > 0) ? <div className="report-payment-chart" role="img" aria-label="Weekly payment totals">
        {activity.map(point => { const value = Number(point.payments); return <div className="report-payment-column" key={point.week_start}><div className="report-payment-value">{value ? compactAmount(value) : ''}</div><span className={value ? 'has-payment' : ''} style={{ height: `${value ? Math.max(8, (value / maxPayment) * 100) : 3}%` }}/><small>{new Date(`${point.week_start}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small></div> })}
      </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fee payments have been recorded in this period."/>}
      <div className="report-payment-note"><span className="report-dot blue-dot"/>Weekly collections <span className="report-payment-total">{amount(financeSummary?.paid_total)} total collected</span></div>
    </section>}

    <div className="reports-section-heading"><div><h2>Explore detailed reports</h2><p>Open a school area to review its underlying records and analysis.</p></div><span>{reports.length} destinations</span></div>
    <section className="reports-grid" aria-label="Available reports">{reports.filter(report => report.href !== '/finance' || canViewFinance).map(report => <article className="report-card" key={report.title}><div className="report-card-top"><span className={`report-card-icon ${report.tone}`}>{report.icon}</span><span className="report-category">{report.category}</span></div><h3>{report.title}</h3><p>{report.description}</p><Link to={report.href}>{report.action}<span aria-hidden="true"> →</span></Link></article>)}</section>
    {!isLoading && !pageError && <div className="report-refresh-note"><ArrowUpOutlined/> Analytics reflect {termName ? `${termName}, ${yearName}` : yearName} records. Update the academic period from the top bar to view another period.</div>}
  </div>
}
