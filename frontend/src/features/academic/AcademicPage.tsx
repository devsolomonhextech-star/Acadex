import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Select, Space, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BookOutlined, CalendarOutlined, PlusOutlined, SearchOutlined, TeamOutlined, UsergroupAddOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import {
  createAcademicTerm, createAcademicYear, createClassGroup, createEnrollment,
  bulkEnrollStudents, fetchAcademicTerms, fetchAcademicYears, fetchClassRoster, fetchClassGroups,
  fetchUnassignedStudents,
} from './academicApi'
import { fetchStudentOptions } from '../students/studentsApi'
import type {
  AcademicTerm, AcademicYear, ClassGroup, ClassRosterStudent, Student, UnassignedStudent,
} from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { TeachingAssignmentsPanel } from './TeachingAssignmentsPanel'
import { TeachersPanel } from './TeachersPanel'
import { TimetablePanel } from './TimetablePanel'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'

type ModalKind = 'year' | 'term' | 'class' | 'enrollment' | null
type AcademicFormValues = {
  name?: string
  ordinal?: number
  dates?: [dayjs.Dayjs, dayjs.Dayjs]
  grade_level?: string
  stream?: string
  student_id?: string
  enrolled_on?: dayjs.Dayjs
}

export default function AcademicPage() {
  const { accessToken, user } = useAuth()
  const { yearId: periodYearId, setYearId: setPeriodYearId } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedClass, setSelectedClass] = useState('')
  const [activeSection, setActiveSection] = useState('classes')
  const [modal, setModal] = useState<ModalKind>(null)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSearch, setAssignSearch] = useState('')
  const [assignSelected, setAssignSelected] = useState<string[]>([])
  const [form] = Form.useForm<AcademicFormValues>()
  const [toast, contextHolder] = message.useMessage()
  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === periodYearId) ? periodYearId : years.some(year => year.id === selectedYear) ? selectedYear : years[0]?.id ?? ''
  const termsQuery = useQuery({ queryKey: ['academic-terms', user?.school_id, yearId], queryFn: () => fetchAcademicTerms(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classGroups = classesQuery.data ?? []
  const classId = classGroups.some(group => group.id === selectedClass)
    ? selectedClass
    : (classGroups.find(group => (group.student_count ?? 0) > 0) ?? classGroups[0])?.id ?? ''
  const rosterQuery = useQuery({
    queryKey: ['class-roster', user?.school_id, classId],
    queryFn: () => fetchClassRoster(accessToken!, classId),
    enabled: !!accessToken && !!classId,
  })
  const unassignedQuery = useQuery({
    queryKey: ['unassigned-students', user?.school_id, yearId, assignSearch],
    queryFn: () => fetchUnassignedStudents(accessToken!, yearId, assignSearch),
    enabled: !!accessToken && !!yearId && assignOpen,
  })
  const assignMutation = useMutation({
    mutationFn: (studentIds: string[]) => bulkEnrollStudents(accessToken!, classId, studentIds),
    onSuccess: async result => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['class-groups', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['class-roster', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['unassigned-students', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['student-options', user?.school_id] }),
      ])
      setAssignOpen(false)
      setAssignSelected([])
      setAssignSearch('')
      toast.success(
        result.skipped
          ? `${result.enrolled} student${result.enrolled === 1 ? '' : 's'} assigned · ${result.skipped} already enrolled`
          : `${result.enrolled} student${result.enrolled === 1 ? '' : 's'} assigned to ${classGroups.find(group => group.id === classId)?.name ?? 'the class'}`,
      )
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const studentQuery = useQuery({ queryKey: ['student-options', user?.school_id], queryFn: () => fetchStudentOptions(accessToken!), enabled: !!accessToken })
  const students = studentQuery.data?.items ?? []
  const mutation = useMutation({
    mutationFn: async (values: AcademicFormValues) => {
      if (!accessToken) throw new Error('Sign in again to continue')
      if (modal === 'year') return createAcademicYear(accessToken, {
        name: String(values.name), starts_on: values.dates?.[0].format('YYYY-MM-DD') ?? '', ends_on: values.dates?.[1].format('YYYY-MM-DD') ?? '',
      })
      if (modal === 'term') return createAcademicTerm(accessToken, {
        academic_year_id: yearId, name: String(values.name), ordinal: Number(values.ordinal),
        starts_on: values.dates?.[0].format('YYYY-MM-DD') ?? '', ends_on: values.dates?.[1].format('YYYY-MM-DD') ?? '',
      })
      if (modal === 'class') return createClassGroup(accessToken, {
        academic_year_id: yearId, name: String(values.name), grade_level: String(values.grade_level), stream: String(values.stream ?? ''),
      })
      if (modal === 'enrollment') return createEnrollment(accessToken, {
        student_id: String(values.student_id), academic_year_id: yearId, class_group_id: classId,
        enrolled_on: values.enrolled_on?.format('YYYY-MM-DD') ?? '',
      })
      throw new Error('Choose an academic action')
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['academic-years', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['academic-terms', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['class-groups', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['class-roster', user?.school_id] }),
        queryClient.invalidateQueries({ queryKey: ['unassigned-students', user?.school_id] }),
      ])
      toast.success(modal === 'enrollment' ? 'Student enrolled in the class' : 'Academic details saved')
      setModal(null)
      form.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const submitAcademicForm = (values: AcademicFormValues) => mutation.mutate(values)
  const readOnly = !['school_admin', 'registrar'].includes(user?.role ?? '')
  const rosterColumns: TableColumnsType<ClassRosterStudent> = [
    { title: 'STUDENT', key: 'student', render: (_, row) => (
      <div className="academic-student">
        <span className="student-avatar">{row.first_name[0]}{row.last_name[0]}</span>
        <span><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></span>
      </div>
    ) },
    { title: 'ENROLLED', dataIndex: 'enrolled_on', key: 'enrolled_on', render: (date: string) => dayjs(date).format('D MMM YYYY') },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color="green" className="student-status">{value}</Tag> },
  ]
  const terms = termsQuery.data ?? []
  const startCreate = (kind: Exclude<ModalKind, null>) => { form.resetFields(); setModal(kind) }
  const pageError = yearsQuery.error ?? classesQuery.error ?? termsQuery.error ?? rosterQuery.error ?? studentQuery.error

  return <div className="page-content academic-page">
    {contextHolder}
    <div className="eyebrow">SCHOOL OPERATIONS</div>
    <div className="students-heading"><div><h1>Classes &amp; academics</h1><p>Set up school years, terms and class groups, then place students into their classes.</p></div>{years.length > 0 && !readOnly && <Button type="primary" icon={<PlusOutlined />} onClick={() => startCreate('class')}>New class group</Button>}</div>
    {pageError && <Alert type="error" showIcon message="Could not load academic setup" description={formatApiError(pageError)} className="student-error" />}
    <section className="academic-year-panel panel">
      <div className="academic-section-title"><div className="simple-icon"><CalendarOutlined /></div><div><h2>Academic year</h2><p>Each year keeps its own terms, class groups and enrollment history.</p></div></div>
      {years.length ? <div className="academic-year-selector"><Select value={yearId} onChange={value => { setSelectedYear(value); setPeriodYearId(value) }} options={years.map((year: AcademicYear) => ({ value: year.id, label: year.name }))} aria-label="Academic year"/><div className="academic-dates">{dayjs(years.find(year => year.id === yearId)?.starts_on).format('D MMM YYYY')} <span>to</span> {dayjs(years.find(year => year.id === yearId)?.ends_on).format('D MMM YYYY')}</div><Tag color="blue">{years.find(year => year.id === yearId)?.status}</Tag></div>
        : <div className="academic-empty-year"><div><strong>Start with an academic year</strong><p>Add a year to organize terms, classes and enrollment.</p></div>{!readOnly && <Button type="primary" icon={<PlusOutlined />} onClick={() => startCreate('year')}>Add academic year</Button>}</div>}
    </section>
    {yearId && <Tabs className="academic-workspace-tabs" activeKey={activeSection} onChange={setActiveSection} items={[
      { key: 'classes', label: 'Classes', children: <>
        <div className="academic-overview-grid">
        <section className="academic-section panel"><div className="academic-card-heading"><div><span className="academic-card-icon"><CalendarOutlined /></span><h2>Terms</h2></div>{!readOnly && <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => startCreate('term')}>Add term</Button>}</div>
          {terms.length ? <div className="term-list">{terms.map((term: AcademicTerm) => <div className="term-row" key={term.id}><span className="term-number">{String(term.ordinal).padStart(2, '0')}</span><span><strong>{term.name}</strong><small>{dayjs(term.starts_on).format('D MMM')} – {dayjs(term.ends_on).format('D MMM YYYY')}</small></span></div>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No terms set up yet" />}
        </section>
        <section className="academic-section panel"><div className="academic-card-heading"><div><span className="academic-card-icon"><BookOutlined /></span><h2>Class groups</h2></div>{!readOnly && <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => startCreate('class')}>Add class</Button>}</div>
          {classGroups.length ? <div className="class-chip-list">{classGroups.map((group: ClassGroup) => <button key={group.id} className={`class-chip ${classId === group.id ? 'selected' : ''}`} onClick={() => setSelectedClass(group.id)}><span className="class-chip-name">{group.name}</span><span>{group.stream ? `Stream ${group.stream}` : group.grade_level} · {group.student_count ?? 0} student{(group.student_count ?? 0) === 1 ? '' : 's'}</span></button>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classes for this year" />}
        </section>
      </div>
      {classId && <section className="academic-section panel roster-panel">
        <div className="academic-card-heading">
          <div><span className="academic-card-icon"><TeamOutlined /></span><div><h2>Students in this class</h2><p>{classGroups.find(group => group.id === classId)?.name} · {rosterQuery.data?.length ?? 0} student{(rosterQuery.data?.length ?? 0) === 1 ? '' : 's'}</p></div></div>
          {!readOnly && <Space>
            <Button icon={<UsergroupAddOutlined />} onClick={() => { setAssignSelected([]); setAssignSearch(''); setAssignOpen(true) }} disabled={!yearId}>Assign students</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => startCreate('enrollment')} disabled={!students.length}>Enroll one student</Button>
          </Space>}
        </div>
        <Table<ClassRosterStudent> rowKey="id" columns={rosterColumns} dataSource={rosterQuery.data ?? []} loading={rosterQuery.isLoading} pagination={{ pageSize: 8, showSizeChanger: false }}
          locale={{ emptyText: (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No students in this class yet">
              {!readOnly && <Button type="primary" icon={<UsergroupAddOutlined />} onClick={() => setAssignOpen(true)}>Assign students</Button>}
            </Empty>
          ) }} />
      </section>}
      </> },
      { key: 'subjects', label: 'Subjects', children: <TeachingAssignmentsPanel yearId={yearId} classes={classGroups} /> },
      { key: 'teachers', label: 'Teachers', children: <TeachersPanel /> },
      { key: 'timetable', label: 'Timetable', children: <TimetablePanel yearId={yearId} classes={classGroups} /> },
    ]} />}
    <Modal title={{ year: 'Add academic year', term: 'Add term', class: 'Add class group', enrollment: 'Enroll student' }[modal ?? 'year']} open={!!modal} onCancel={() => setModal(null)} footer={null} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submitAcademicForm} className="academic-form">
        {modal === 'year' && <><Form.Item name="name" label="Year name" rules={[{ required: true, message: 'Enter a year name' }]}><Input placeholder="2026 / 2027" maxLength={80}/></Form.Item><Form.Item name="dates" label="Academic year dates" rules={[{ required: true, message: 'Choose the start and end dates' }]}><DatePicker.RangePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        {modal === 'term' && <><Form.Item name="name" label="Term name" rules={[{ required: true }]}><Input placeholder="Term 1" maxLength={80}/></Form.Item><Form.Item name="ordinal" label="Term order" rules={[{ required: true }]}><Select options={[1, 2, 3, 4].map(value => ({ value, label: `Term ${value}` }))}/></Form.Item><Form.Item name="dates" label="Term dates" rules={[{ required: true }]}><DatePicker.RangePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        {modal === 'class' && <><Form.Item name="name" label="Class group name" rules={[{ required: true }]}><Input placeholder="Primary 4 A" maxLength={80}/></Form.Item><Form.Item name="grade_level" label="Grade level" rules={[{ required: true }]}><Input placeholder="Primary 4" maxLength={40}/></Form.Item><Form.Item name="stream" label="Stream"><Input placeholder="A (optional)" maxLength={40}/></Form.Item></>}
        {modal === 'enrollment' && <><Form.Item name="student_id" label="Student" rules={[{ required: true, message: 'Choose a student' }]}><Select showSearch optionFilterProp="label" placeholder="Find by name or admission number" options={students.map((student: Student) => ({ value: student.id, label: `${student.first_name} ${student.last_name} · ${student.admission_number}` }))}/></Form.Item><Form.Item name="enrolled_on" label="Enrollment date" rules={[{ required: true, message: 'Choose an enrollment date' }]}><DatePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        <div className="student-form-actions"><Button onClick={() => setModal(null)}>Cancel</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>{modal === 'enrollment' ? 'Enroll student' : 'Save details'}</Button></div>
      </Form>
    </Modal>

    <Modal
      title={`Assign students to ${classGroups.find(group => group.id === classId)?.name ?? 'this class'}`}
      open={assignOpen}
      onCancel={() => { setAssignOpen(false); setAssignSelected([]); setAssignSearch('') }}
      width={720}
      footer={<div className="student-form-actions">
        <Button onClick={() => { setAssignOpen(false); setAssignSelected([]); setAssignSearch('') }}>Cancel</Button>
        <Button type="primary" loading={assignMutation.isPending} disabled={!assignSelected.length}
                onClick={() => assignMutation.mutate(assignSelected)}>
          Assign {assignSelected.length || ''} student{assignSelected.length === 1 ? '' : 's'}
        </Button>
      </div>}
    >
      <p className="form-hint">
        These students have no class in {years.find(year => year.id === yearId)?.name ?? 'this academic year'} yet.
        A student can belong to one class per academic year.
      </p>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="Search by name or admission number"
        value={assignSearch}
        onChange={event => setAssignSearch(event.target.value)}
        className="assign-search"
        aria-label="Search students without a class"
      />
      <Table<UnassignedStudent>
        rowKey="id"
        size="small"
        loading={unassignedQuery.isLoading}
        dataSource={unassignedQuery.data ?? []}
        pagination={{ pageSize: 6, showSizeChanger: false }}
        rowSelection={{
          selectedRowKeys: assignSelected,
          preserveSelectedRowKeys: true,
          onChange: keys => setAssignSelected(keys.map(String)),
        }}
        columns={[
          { title: 'STUDENT', key: 'student', render: (_, row) => (
            <div className="academic-student">
              <span className="student-avatar">{row.first_name[0]}{row.last_name[0]}</span>
              <span><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></span>
            </div>
          ) },
          { title: 'ADMISSION NO.', dataIndex: 'admission_number', key: 'admission' },
        ]}
        locale={{ emptyText: (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={assignSearch
              ? 'No unassigned students match that search.'
              : 'Every active student already has a class this year.'}
          />
        ) }}
      />
    </Modal>
  </div>
}
