import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button, Empty, Input, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { CloudUploadOutlined, SearchOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { fetchStudents } from './studentsApi'
import AddStudentWizard from './AddStudentWizard'
import ImportStudentsModal from './ImportStudentsModal'
import type { Student } from '../../shared/api/types'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'

const statusColors: Record<Student['status'], string> = {
  active: 'green', transferred: 'blue', graduated: 'purple', withdrawn: 'default',
}

export default function StudentsPage() {
  const { accessToken, user } = useAuth()
  const { yearId } = useAcademicPeriod()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const students = useQuery({
    queryKey: ['students', user?.school_id, page, activeSearch, status, yearId],
    queryFn: () => fetchStudents(accessToken!, page, activeSearch, status === 'all' ? undefined : status, yearId || undefined),
    enabled: Boolean(accessToken && user),
  })
  const columns: TableColumnsType<Student> = [
    { title: 'STUDENT', key: 'name', render: (_, item) => <div className="student-name-cell"><span className="student-avatar">{item.first_name[0]}{item.last_name[0]}</span><span><strong><Link className="student-profile-link" to={`/students/${item.id}`}>{item.first_name} {item.last_name}</Link></strong><small>{item.admission_number}</small></span></div> },
    { title: 'CLASS', dataIndex: 'class_name', key: 'class', render: value => value ?? <span className="table-muted">Not enrolled</span> },
    { title: 'PARENT / GUARDIAN', key: 'guardian', render: (_, item) => item.guardian_name ? <div className="student-guardian-cell"><strong>{item.guardian_name}</strong><small>{item.guardian_contact ?? 'Contact not added'}</small></div> : <span className="table-muted">Not linked</span> },
    { title: 'DATE OF BIRTH', dataIndex: 'date_of_birth', key: 'date_of_birth', render: value => value ? dayjs(value).format('D MMM YYYY') : <span className="table-muted">—</span> },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: Student['status']) => <Tag color={statusColors[value]} bordered={false} className="student-status">{value}</Tag> },
    { title: 'ACTION', key: 'action', align: 'right', render: (_, item) => <Link className="student-row-action" to={`/students/${item.id}`}>View</Link> },
  ]
  const openCreate = () => setModalOpen(true)

  return <div className="page-content students-page">
    <div className="students-heading"><div><div className="eyebrow">PEOPLE <span className="live-dot"/> STUDENT INFORMATION</div><h1>Students</h1><p className="welcome-subtitle">Manage student records and admission details for {user?.school_name}.</p></div><Space size={8}><Button icon={<CloudUploadOutlined/>} onClick={() => setImportOpen(true)}>Import</Button><Button type="primary" icon={<UserAddOutlined/>} onClick={openCreate}>Add student</Button></Space></div>
    <div className="student-summary"><div className="summary-icon"><TeamOutlined/></div><div><strong>{students.data?.total ?? '—'}</strong><span>Matching records</span></div><div className="summary-divider"/><div className="summary-context">Student records and class enrollment history are scoped to this school.</div></div>
    <section className="panel students-panel"><div className="students-toolbar"><div><h2>Student directory</h2><p>Search by student name or admission number</p></div><Space size={8}><Select aria-label="Student status filter" value={status} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'transferred', label: 'Transferred' }, { value: 'graduated', label: 'Graduated' }, { value: 'withdrawn', label: 'Withdrawn' }]} onChange={value => { setStatus(value); setPage(1) }} className="student-filter"/><Input allowClear prefix={<SearchOutlined/>} placeholder="Search students" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} className="student-search"/></Space></div>
      {students.isError && <div className="student-error">{formatApiError(students.error)}</div>}
      <Table<Student> rowKey="id" columns={columns} dataSource={students.data?.items ?? []} loading={students.isLoading} pagination={{ current: page, pageSize: 10, total: students.data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: total => `${total} student${total === 1 ? '' : 's'}` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No matching students found' : 'No student records yet'} /> }}/>
    </section>
    <AddStudentWizard open={modalOpen} onClose={() => setModalOpen(false)}/>
    <ImportStudentsModal open={importOpen} onClose={() => setImportOpen(false)}/>
  </div>
}
