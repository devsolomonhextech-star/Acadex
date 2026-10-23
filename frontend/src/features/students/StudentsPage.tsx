import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DatePicker, Empty, Input, Modal, Select, Space, Table, Tag } from 'antd'
import type { TableColumnsType } from 'antd'
import { SearchOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import dayjs from 'dayjs'
import { createStudent, fetchStudents } from './studentsApi'
import type { Student } from '../../shared/api/types'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'

const studentSchema = z.object({
  admission_number: z.string().trim().min(1, 'Enter the admission number').max(40),
  first_name: z.string().trim().min(1, 'Enter the first name').max(80),
  last_name: z.string().trim().min(1, 'Enter the last name').max(80),
  date_of_birth: z.string().optional(),
})
type StudentValues = z.infer<typeof studentSchema>

const statusColors: Record<Student['status'], string> = {
  active: 'green', transferred: 'blue', graduated: 'purple', withdrawn: 'default',
}

export default function StudentsPage() {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const { control, handleSubmit, reset, formState: { errors } } = useForm<StudentValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: { admission_number: '', first_name: '', last_name: '', date_of_birth: '' },
  })
  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])
  const students = useQuery({
    queryKey: ['students', user?.school_id, page, activeSearch, status],
    queryFn: () => fetchStudents(accessToken!, page, activeSearch, status === 'all' ? undefined : status),
    enabled: Boolean(accessToken && user),
  })
  const addStudent = useMutation({
    mutationFn: (values: StudentValues) => createStudent(accessToken!, {
      admission_number: values.admission_number,
      first_name: values.first_name,
      last_name: values.last_name,
      ...(values.date_of_birth ? { date_of_birth: values.date_of_birth } : {}),
    }),
    onSuccess: async () => {
      setModalOpen(false)
      reset()
      setFormError('')
      await queryClient.invalidateQueries({ queryKey: ['students', user?.school_id] })
    },
    onError: error => setFormError(formatApiError(error)),
  })
  const columns: TableColumnsType<Student> = [
    { title: 'STUDENT', key: 'name', render: (_, item) => <div className="student-name-cell"><span className="student-avatar">{item.first_name[0]}{item.last_name[0]}</span><span><strong>{item.first_name} {item.last_name}</strong><small>{item.admission_number}</small></span></div> },
    { title: 'DATE OF BIRTH', dataIndex: 'date_of_birth', key: 'date_of_birth', render: value => value ? dayjs(value).format('D MMM YYYY') : <span className="table-muted">—</span> },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: Student['status']) => <Tag color={statusColors[value]} bordered={false} className="student-status">{value}</Tag> },
  ]
  const submit = handleSubmit(values => {
    setFormError('')
    addStudent.mutate(values)
  })
  const openCreate = () => { reset(); setFormError(''); setModalOpen(true) }

  return <div className="page-content students-page">
    <div className="students-heading"><div><div className="eyebrow">PEOPLE <span className="live-dot"/> STUDENT INFORMATION</div><h1>Students</h1><p className="welcome-subtitle">Manage student records and admission details for {user?.school_name}.</p></div><Button type="primary" icon={<UserAddOutlined/>} onClick={openCreate}>Add student</Button></div>
    <div className="student-summary"><div className="summary-icon"><TeamOutlined/></div><div><strong>{students.data?.total ?? '—'}</strong><span>Matching records</span></div><div className="summary-divider"/><div className="summary-context">Student records and class enrollment history are scoped to this school.</div></div>
    <section className="panel students-panel"><div className="students-toolbar"><div><h2>Student directory</h2><p>Search by student name or admission number</p></div><Space size={8}><Select aria-label="Student status filter" value={status} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'transferred', label: 'Transferred' }, { value: 'graduated', label: 'Graduated' }, { value: 'withdrawn', label: 'Withdrawn' }]} onChange={value => { setStatus(value); setPage(1) }} className="student-filter"/><Input allowClear prefix={<SearchOutlined/>} placeholder="Search students" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} className="student-search"/></Space></div>
      {students.isError && <div className="student-error">{formatApiError(students.error)}</div>}
      <Table<Student> rowKey="id" columns={columns} dataSource={students.data?.items ?? []} loading={students.isLoading} pagination={{ current: page, pageSize: 10, total: students.data?.total ?? 0, onChange: setPage, showSizeChanger: false, showTotal: total => `${total} student${total === 1 ? '' : 's'}` }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={search ? 'No matching students found' : 'No student records yet'} /> }}/>
    </section>
    <Modal title="Add a student" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} destroyOnHidden>
      <p className="modal-intro">Enter the student’s basic admission details. Enrollment and guardian information can be added in later steps.</p>
      {formError && <div className="student-error modal-error">{formError}</div>}
      <form className="student-form" onSubmit={submit}>
        <label>Admission number</label><Controller control={control} name="admission_number" render={({ field }) => <Input {...field} placeholder="e.g. AB-2026-001" autoComplete="off"/>}/>{errors.admission_number && <small>{errors.admission_number.message}</small>}
        <div className="student-form-row"><div><label>First name</label><Controller control={control} name="first_name" render={({ field }) => <Input {...field} placeholder="First name" autoComplete="given-name"/>}/>{errors.first_name && <small>{errors.first_name.message}</small>}</div><div><label>Last name</label><Controller control={control} name="last_name" render={({ field }) => <Input {...field} placeholder="Last name" autoComplete="family-name"/>}/>{errors.last_name && <small>{errors.last_name.message}</small>}</div></div>
        <label>Date of birth <span className="optional-label">Optional</span></label><Controller control={control} name="date_of_birth" render={({ field }) => <DatePicker className="student-date" placeholder="Select date" format="DD MMM YYYY" disabledDate={current => current && current.isAfter(dayjs(), 'day')} value={field.value ? dayjs(field.value) : null} onChange={value => field.onChange(value?.format('YYYY-MM-DD') ?? '')}/>} />
        <div className="student-form-actions"><Button onClick={() => setModalOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={addStudent.isPending}>Save student</Button></div>
      </form>
    </Modal>
  </div>
}
