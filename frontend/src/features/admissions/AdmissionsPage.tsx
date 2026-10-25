import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Input, Select, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { SearchOutlined, TeamOutlined, UserAddOutlined, UserSwitchOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { Student } from '../../shared/api/types'
import { fetchStudents } from '../students/studentsApi'

const statuses = [
  { value: 'all', label: 'All students' }, { value: 'active', label: 'Active' },
  { value: 'transferred', label: 'Transferred' }, { value: 'graduated', label: 'Graduated' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

export default function AdmissionsPage() {
  const { accessToken } = useAuth()
  const { yearId, years, loading: periodLoading } = useAcademicPeriod()
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['admissions-directory', yearId, status, search, page],
    queryFn: () => fetchStudents(accessToken!, page, search, status === 'all' ? undefined : status, yearId || undefined),
    enabled: !!accessToken && !periodLoading,
  })
  const statusCounts = useQuery({
    queryKey: ['admissions-status-counts', yearId],
    queryFn: async () => {
      const results = await Promise.all(['active', 'transferred', 'graduated', 'withdrawn'].map(async item => {
        const page = await fetchStudents(accessToken!, 1, '', item, yearId || undefined)
        return [item, page.total] as const
      }))
      return Object.fromEntries(results) as Record<string, number>
    },
    enabled: !!accessToken && !periodLoading,
  })

  const columns: ColumnsType<Student> = [
    { title: 'STUDENT', key: 'name', render: (_, row) => <Link className="admission-student" to={`/students/${row.id}`}><span className="admission-avatar">{row.first_name[0]}{row.last_name[0]}</span><span><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></span></Link> },
    { title: 'CLASS', dataIndex: 'class_name', render: value => value || <span className="report-muted">Not enrolled</span> },
    { title: 'GUARDIAN', dataIndex: 'guardian_name', render: value => value || <span className="report-muted">Not provided</span> },
    { title: 'STATUS', dataIndex: 'status', render: value => <span className={`admission-status ${value}`}>{value}</span> },
    { title: '', key: 'action', align: 'right', render: (_, row) => <Link to={`/students/${row.id}`} className="report-row-link">View record →</Link> },
  ]

  const cards = [
    { title: 'Active students', value: statusCounts.data?.active, icon: <TeamOutlined/>, tone: 'blue', note: 'Currently enrolled' },
    { title: 'Transferred', value: statusCounts.data?.transferred, icon: <UserSwitchOutlined/>, tone: 'purple', note: 'Moved to another school' },
    { title: 'Graduated', value: statusCounts.data?.graduated, icon: <UserAddOutlined/>, tone: 'green', note: 'Completed their studies' },
    { title: 'Withdrawn', value: statusCounts.data?.withdrawn, icon: <UserSwitchOutlined/>, tone: 'orange', note: 'No longer enrolled' },
  ]

  return <div className="page-content report-page">
    <div className="report-heading"><div><div className="eyebrow">SCHOOL WORKSPACE · ENROLLMENT</div><h1>Admissions</h1><p className="welcome-subtitle">Review student records and keep enrollment information up to date.</p></div><SpaceActions/></div>
    <div className="report-context"><span className="report-context-mark"><UserAddOutlined/></span><span><strong>{years.find(item => item.id === yearId)?.name ?? 'Selected academic year'}</strong><small>Enrollment view follows the academic year selected in the top bar.</small></span><span className="report-context-count">{query.data?.total ?? '—'} student records</span></div>
    <section className="admissions-stats" aria-label="Enrollment status summary">{cards.map(card => <article className="admissions-stat" key={card.title}><span className={`admissions-stat-icon ${card.tone}`}>{card.icon}</span><div><small>{card.title}</small><strong>{statusCounts.isLoading ? '—' : (card.value ?? 0).toLocaleString()}</strong><span>{card.note}</span></div></article>)}</section>
    <section className="panel admissions-panel"><div className="admissions-toolbar"><div><h2>Student enrollment</h2><p>Search school records by student name or admission number.</p></div><div className="admissions-filters"><Select aria-label="Filter by enrollment status" value={status} options={statuses} onChange={value => { setStatus(value); setPage(1) }}/><Input allowClear prefix={<SearchOutlined/>} placeholder="Search students" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }}/></div></div>
      {query.isError && <Alert type="error" showIcon message="Could not load enrollment records" description={formatApiError(query.error)} action={<Button size="small" onClick={() => void query.refetch()}>Retry</Button>}/>}
      {query.isLoading ? <div className="admissions-loading"><Spin/><span>Loading student records…</span></div> : <Table<Student> rowKey="id" columns={columns} dataSource={query.data?.items ?? []} pagination={false} locale={{ emptyText: 'No student records match these filters.' }}/>}
      {!query.isLoading && query.data && <div className="admissions-table-foot">Showing {query.data.items.length ? (page - 1) * query.data.page_size + 1 : 0}–{Math.min(page * query.data.page_size, query.data.total)} of {query.data.total} students <div className="admissions-pagination"><Button size="small" disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</Button><span>Page {page} of {Math.max(1, Math.ceil(query.data.total / query.data.page_size))}</span><Button size="small" disabled={page * query.data.page_size >= query.data.total} onClick={() => setPage(value => value + 1)}>Next</Button><Link to="/students">Open full directory →</Link></div></div>}
    </section>
  </div>
}

function SpaceActions() {
  return <div className="admissions-actions"><Link to="/students"><Button>Student directory</Button></Link><Link to="/students"><Button type="primary" icon={<UserAddOutlined/>}>Add student</Button></Link></div>
}
