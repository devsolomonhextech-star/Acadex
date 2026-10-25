import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, DatePicker, Empty, Form, Input, Modal, Select, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { BookOutlined, CalendarOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import {
  createAcademicTerm, createAcademicYear, createClassGroup, createEnrollment,
  fetchAcademicTerms, fetchAcademicYears, fetchClassEnrollments, fetchClassGroups,
} from './academicApi'
import { fetchStudentOptions } from '../students/studentsApi'
import type { AcademicTerm, AcademicYear, ClassGroup, Enrollment, Student } from '../../shared/api/types'
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
  const [modal, setModal] = useState<ModalKind>(null)
  const [form] = Form.useForm<AcademicFormValues>()
  const [toast, contextHolder] = message.useMessage()
  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === periodYearId) ? periodYearId : years.some(year => year.id === selectedYear) ? selectedYear : years[0]?.id ?? ''
  const termsQuery = useQuery({ queryKey: ['academic-terms', user?.school_id, yearId], queryFn: () => fetchAcademicTerms(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classGroups = classesQuery.data ?? []
  const classId = classGroups.some(group => group.id === selectedClass) ? selectedClass : classGroups[0]?.id ?? ''
  const enrollmentsQuery = useQuery({ queryKey: ['enrollments', user?.school_id, classId], queryFn: () => fetchClassEnrollments(accessToken!, classId), enabled: !!accessToken && !!classId })
  const studentQuery = useQuery({ queryKey: ['student-options', user?.school_id], queryFn: () => fetchStudentOptions(accessToken!), enabled: !!accessToken })
  const studentById = useMemo(() => new Map((studentQuery.data?.items ?? []).map(student => [student.id, student])), [studentQuery.data])
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
        queryClient.invalidateQueries({ queryKey: ['enrollments', user?.school_id] }),
      ])
      toast.success(modal === 'enrollment' ? 'Student enrolled in the class' : 'Academic details saved')
      setModal(null)
      form.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const submitAcademicForm = (values: AcademicFormValues) => mutation.mutate(values)
  const readOnly = !['school_admin', 'registrar'].includes(user?.role ?? '')
  const enrollmentColumns: TableColumnsType<Enrollment> = [
    { title: 'STUDENT', dataIndex: 'student_id', key: 'student', render: (id: string) => {
      const student = studentById.get(id)
      return student ? <div className="academic-student"><span className="student-avatar">{student.first_name[0]}{student.last_name[0]}</span><span><strong>{student.first_name} {student.last_name}</strong><small>{student.admission_number}</small></span></div> : <span className="table-muted">Student record</span>
    } },
    { title: 'ENROLLED', dataIndex: 'enrolled_on', key: 'enrolled_on', render: (date: string) => dayjs(date).format('D MMM YYYY') },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color="green" className="student-status">{value}</Tag> },
  ]
  const terms = termsQuery.data ?? []
  const startCreate = (kind: Exclude<ModalKind, null>) => { form.resetFields(); setModal(kind) }
  const pageError = yearsQuery.error ?? classesQuery.error ?? termsQuery.error ?? enrollmentsQuery.error ?? studentQuery.error

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
    {yearId && <>
      <TeachingAssignmentsPanel yearId={yearId} classes={classGroups} />
      <TimetablePanel yearId={yearId} classes={classGroups} />
      <TeachersPanel />
      <div className="academic-overview-grid">
        <section className="academic-section panel"><div className="academic-card-heading"><div><span className="academic-card-icon"><CalendarOutlined /></span><h2>Terms</h2></div>{!readOnly && <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => startCreate('term')}>Add term</Button>}</div>
          {terms.length ? <div className="term-list">{terms.map((term: AcademicTerm) => <div className="term-row" key={term.id}><span className="term-number">{String(term.ordinal).padStart(2, '0')}</span><span><strong>{term.name}</strong><small>{dayjs(term.starts_on).format('D MMM')} – {dayjs(term.ends_on).format('D MMM YYYY')}</small></span></div>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No terms set up yet" />}
        </section>
        <section className="academic-section panel"><div className="academic-card-heading"><div><span className="academic-card-icon"><BookOutlined /></span><h2>Class groups</h2></div>{!readOnly && <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => startCreate('class')}>Add class</Button>}</div>
          {classGroups.length ? <div className="class-chip-list">{classGroups.map((group: ClassGroup) => <button key={group.id} className={`class-chip ${classId === group.id ? 'selected' : ''}`} onClick={() => setSelectedClass(group.id)}><span className="class-chip-name">{group.name}</span><span>{group.stream ? `Stream ${group.stream}` : group.grade_level}</span></button>)}</div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No classes for this year" />}
        </section>
      </div>
      {classId && <section className="academic-section panel roster-panel"><div className="academic-card-heading"><div><span className="academic-card-icon"><TeamOutlined /></span><div><h2>Class roster</h2><p>{classGroups.find(group => group.id === classId)?.name} · {enrollmentsQuery.data?.length ?? 0} enrolled</p></div></div>{!readOnly && <Button type="primary" icon={<PlusOutlined />} onClick={() => startCreate('enrollment')} disabled={!students.length}>Enroll student</Button>}</div>
      <Table<Enrollment> rowKey="id" columns={enrollmentColumns} dataSource={enrollmentsQuery.data ?? []} loading={enrollmentsQuery.isLoading || studentQuery.isLoading} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No students in this class yet" /> }} />
      </section>}
    </>}
    <Modal title={{ year: 'Add academic year', term: 'Add term', class: 'Add class group', enrollment: 'Enroll student' }[modal ?? 'year']} open={!!modal} onCancel={() => setModal(null)} footer={null} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={submitAcademicForm} className="academic-form">
        {modal === 'year' && <><Form.Item name="name" label="Year name" rules={[{ required: true, message: 'Enter a year name' }]}><Input placeholder="2026 / 2027" maxLength={80}/></Form.Item><Form.Item name="dates" label="Academic year dates" rules={[{ required: true, message: 'Choose the start and end dates' }]}><DatePicker.RangePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        {modal === 'term' && <><Form.Item name="name" label="Term name" rules={[{ required: true }]}><Input placeholder="Term 1" maxLength={80}/></Form.Item><Form.Item name="ordinal" label="Term order" rules={[{ required: true }]}><Select options={[1, 2, 3, 4].map(value => ({ value, label: `Term ${value}` }))}/></Form.Item><Form.Item name="dates" label="Term dates" rules={[{ required: true }]}><DatePicker.RangePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        {modal === 'class' && <><Form.Item name="name" label="Class group name" rules={[{ required: true }]}><Input placeholder="Primary 4 A" maxLength={80}/></Form.Item><Form.Item name="grade_level" label="Grade level" rules={[{ required: true }]}><Input placeholder="Primary 4" maxLength={40}/></Form.Item><Form.Item name="stream" label="Stream"><Input placeholder="A (optional)" maxLength={40}/></Form.Item></>}
        {modal === 'enrollment' && <><Form.Item name="student_id" label="Student" rules={[{ required: true, message: 'Choose a student' }]}><Select showSearch optionFilterProp="label" placeholder="Find by name or admission number" options={students.map((student: Student) => ({ value: student.id, label: `${student.first_name} ${student.last_name} · ${student.admission_number}` }))}/></Form.Item><Form.Item name="enrolled_on" label="Enrollment date" rules={[{ required: true, message: 'Choose an enrollment date' }]}><DatePicker className="academic-range" format="D MMM YYYY"/></Form.Item></>}
        <div className="student-form-actions"><Button onClick={() => setModal(null)}>Cancel</Button><Button type="primary" htmlType="submit" loading={mutation.isPending}>{modal === 'enrollment' ? 'Enroll student' : 'Save details'}</Button></div>
      </Form>
    </Modal>
  </div>
}
