import { Link } from 'react-router-dom'
import { Alert, Button, Skeleton, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ArrowRightOutlined, BankOutlined, CreditCardOutlined, RiseOutlined,
  TeamOutlined, UserOutlined,
} from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { formatApiError } from '../../shared/api/errors'
import { useSuperAdmin } from './SuperAdminAuth'
import { fetchPlatformOverview, type PlatformSchool } from './superadminApi'

const ROLE_LABELS: Record<string, string> = {
  school_admin: 'School admins', principal: 'Principals', teacher: 'Teachers',
  finance: 'Finance', registrar: 'Registrars', parent: 'Parents',
  student: 'Students', staff: 'Staff',
}

function planLabel(school: PlatformSchool) {
  return school.subscription_status === 'active'
    ? `Active · ${school.student_limit.toLocaleString()} seats`
    : 'Not subscribed'
}

function schoolColumns(): ColumnsType<PlatformSchool> {
  return [
    {
      title: 'School', key: 'school',
      render: (_, school) => <div className="sa-school-cell"><strong>{school.name}</strong><span>{school.slug}</span></div>,
    },
    {
      title: 'Administrator', key: 'admin',
      render: (_, school) => school.admin_name
        ? <div className="sa-school-cell"><span>{school.admin_name}</span><small>{school.admin_email}</small></div>
        : <span className="sa-muted">No administrator</span>,
    },
    { title: 'Students', dataIndex: 'student_count', key: 'students', align: 'right' },
    {
      title: 'Plan', key: 'plan',
      render: (_, school) => <Tag color={school.subscription_status === 'active' ? 'blue' : 'default'}>{planLabel(school)}</Tag>,
    },
    {
      title: 'Joined', dataIndex: 'created_at', key: 'created',
      render: value => <span className="sa-muted">{dayjs(value).format('DD MMM YYYY')}</span>,
    },
  ]
}

export default function SuperAdminOverviewPage() {
  const { token } = useSuperAdmin()
  const overview = useQuery({
    queryKey: ['platform-overview'],
    queryFn: () => fetchPlatformOverview(token!),
    enabled: Boolean(token),
  })

  if (overview.isLoading) return <div className="sa-page"><Skeleton active paragraph={{ rows: 10 }}/></div>
  if (overview.isError || !overview.data) return <div className="sa-page">
    <Alert type="error" showIcon message="The platform overview could not load"
           description={overview.error ? formatApiError(overview.error) : undefined}
           action={<Button onClick={() => { void overview.refetch() }}>Try again</Button>}/>
  </div>

  const data = overview.data
  const peak = Math.max(...data.signups.map(month => month.count), 1)
  const roles = Object.entries(data.members_by_role).filter(([, count]) => count > 0)

  return <div className="sa-page">
    <div className="sa-page-heading">
      <div>
        <span className="sa-eyebrow">PLATFORM HEALTH</span>
        <h2>Good day, here is Acadex today.</h2>
        <p>A live read of the schools, people and plans across the platform.</p>
      </div>
      <Link to="/superadmin/schools"><Button type="primary">Open school directory <ArrowRightOutlined/></Button></Link>
    </div>

    <section className="sa-stats">
      <article className="sa-stat">
        <span className="sa-stat-icon blue"><BankOutlined/></span>
        <div><small>Schools</small><strong>{data.schools_total.toLocaleString()}</strong>
          <span>{data.schools_active} active · {data.schools_total - data.schools_active} paused</span></div>
      </article>
      <article className="sa-stat">
        <span className="sa-stat-icon green"><RiseOutlined/></span>
        <div><small>New schools · 30 days</small><strong>{data.schools_new_30_days.toLocaleString()}</strong>
          <span>Signed up on Acadex</span></div>
      </article>
      <article className="sa-stat">
        <span className="sa-stat-icon amber"><UserOutlined/></span>
        <div><small>Students</small><strong>{data.students_total.toLocaleString()}</strong>
          <span>Across every workspace</span></div>
      </article>
      <article className="sa-stat">
        <span className="sa-stat-icon violet"><CreditCardOutlined/></span>
        <div><small>Active subscriptions</small><strong>{data.active_subscriptions.toLocaleString()}</strong>
          <span>{data.licensed_students.toLocaleString()} licensed seats</span></div>
      </article>
    </section>

    <section className="sa-grid">
      <article className="sa-card sa-chart-card">
        <header className="sa-card-head"><div><h3>New schools</h3><p>Signups over the last six months</p></div></header>
        <div className="sa-chart">
          {data.signups.map(month => <div className="sa-chart-column" key={month.month}>
            <span className="sa-chart-value">{month.count}</span>
            <div className="sa-chart-track">
              <div className="sa-chart-bar" style={{ height: `${Math.max((month.count / peak) * 100, month.count ? 8 : 2)}%` }}/>
            </div>
            <span className="sa-chart-label">{dayjs(`${month.month}-01`).format('MMM')}</span>
          </div>)}
        </div>
      </article>

      <article className="sa-card">
        <header className="sa-card-head"><div><h3>People on the platform</h3><p>Active accounts by school role</p></div><TeamOutlined className="sa-card-icon"/></header>
        {roles.length
          ? <ul className="sa-role-list">
            {roles.map(([role, count]) => <li key={role}>
              <span>{ROLE_LABELS[role] ?? role}</span><strong>{count.toLocaleString()}</strong>
            </li>)}
          </ul>
          : <p className="sa-empty">No school members yet.</p>}
      </article>
    </section>

    <section className="sa-card">
      <header className="sa-card-head">
        <div><h3>Recently joined schools</h3><p>The newest workspaces on Acadex</p></div>
        <Link to="/superadmin/schools" className="sa-text-link">View all <ArrowRightOutlined/></Link>
      </header>
      <Table<PlatformSchool>
        rowKey="id" size="middle" columns={schoolColumns()} dataSource={data.recent_schools}
        pagination={false} scroll={{ x: 720 }}
        locale={{ emptyText: 'No schools have joined yet.' }}
      />
    </section>
  </div>
}
