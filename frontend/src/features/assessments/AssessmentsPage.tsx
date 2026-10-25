import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert, Button, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { BookOutlined, CheckOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { fetchAcademicTerms, fetchAcademicYears, fetchClassGroups } from '../academic/academicApi'
import { fetchSubjects, fetchTeachingAssignments } from '../academic/teachingApi'
import type { AcademicTerm, AcademicYear, AssessmentCategory, AssessmentSummary, GradebookStudent } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import {
  createAssessment, fetchAssessments, fetchGradebook, reviewAssessment, saveGradebook, submitAssessment,
} from './assessmentsApi'

type AssessmentFields = {
  class_group_id: string; subject_id: string; term_id: string; title: string; category: AssessmentCategory
  max_score: number; weight_percent?: number; due_on?: Dayjs
}
type ReviewFields = { note?: string }
type DraftMark = { score: number | null; comment: string; submission_status: GradebookStudent['submission_status'] }
const categories: { value: AssessmentCategory; label: string }[] = [
  { value: 'quiz', label: 'Quiz' }, { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' }, { value: 'class_test', label: 'Class test' },
  { value: 'examination', label: 'Examination' }, { value: 'practical', label: 'Practical' },
  { value: 'other', label: 'Other' },
]
const statusColor: Record<string, string> = { open: 'blue', submitted: 'gold', returned: 'orange', approved: 'green' }

function displayCategory(value: string) {
  return categories.find(category => category.value === value)?.label ?? value
}

export default function AssessmentsPage() {
  const { accessToken, user } = useAuth()
  const { yearId: periodYearId, termId: periodTermId, setYearId: setPeriodYearId, setTermId: setPeriodTermId } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [gradebookId, setGradebookId] = useState('')
  const [draft, setDraft] = useState<Record<string, DraftMark>>({})
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'return' | null>(null)
  const [createForm] = Form.useForm<AssessmentFields>()
  const [reviewForm] = Form.useForm<ReviewFields>()
  const canCreate = ['school_admin', 'registrar', 'teacher'].includes(user?.role ?? '')
  const canReview = ['school_admin', 'principal'].includes(user?.role ?? '')
  const yearsQuery = useQuery({ queryKey: ['academic-years', user?.school_id], queryFn: () => fetchAcademicYears(accessToken!), enabled: !!accessToken })
  const years = yearsQuery.data ?? []
  const yearId = years.some(year => year.id === periodYearId) ? periodYearId : years[0]?.id ?? ''
  useEffect(() => {
    setSelectedClass('')
    setSelectedSubject('')
  }, [yearId])
  useEffect(() => {
    setGradebookId('')
  }, [yearId, periodTermId])
  const termsQuery = useQuery({ queryKey: ['academic-terms', user?.school_id, yearId], queryFn: () => fetchAcademicTerms(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const terms = termsQuery.data ?? []
  const classesQuery = useQuery({ queryKey: ['class-groups', user?.school_id, yearId], queryFn: () => fetchClassGroups(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const classes = classesQuery.data ?? []
  const classId = classes.some(group => group.id === selectedClass) ? selectedClass : ''
  const formClassId = Form.useWatch('class_group_id', createForm) ?? classId
  const subjectsQuery = useQuery({ queryKey: ['subjects', user?.school_id], queryFn: () => fetchSubjects(accessToken!), enabled: !!accessToken })
  const assignmentsQuery = useQuery({ queryKey: ['teaching-assignments', user?.school_id, yearId], queryFn: () => fetchTeachingAssignments(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const assignments = assignmentsQuery.data ?? []
  const assignedSubjects = useMemo(() => assignments.filter(item => item.class_group_id === classId).map(item => item.subject_id), [assignments, classId])
  const subjects = subjectsQuery.data ?? []
  const subjectOptions = (user?.role === 'teacher' ? subjects.filter(item => assignedSubjects.includes(item.id)) : subjects)
    .map(item => ({ value: item.id, label: `${item.name} · ${item.code}` }))
  const createSubjectOptions = (user?.role === 'teacher'
    ? subjects.filter(item => assignments.some(assignment => assignment.class_group_id === formClassId && assignment.subject_id === item.id))
    : subjects).map(item => ({ value: item.id, label: `${item.name} · ${item.code}` }))
  const yearTerms = terms.filter(term => term.academic_year_id === yearId)
  const termId = yearTerms.some(term => term.id === periodTermId) ? periodTermId : yearTerms[0]?.id ?? ''
  const listQuery = useQuery({ queryKey: ['assessments', user?.school_id, yearId], queryFn: () => fetchAssessments(accessToken!, yearId), enabled: !!accessToken && !!yearId })
  const gradebookQuery = useQuery({ queryKey: ['gradebook', user?.school_id, gradebookId], queryFn: () => fetchGradebook(accessToken!, gradebookId), enabled: !!accessToken && !!gradebookId })
  const gradebook = gradebookQuery.data
  const allStudentsScored = !!gradebook?.students.length && gradebook.students.every(student => {
    const value = Object.prototype.hasOwnProperty.call(draft, student.student_id)
      ? draft[student.student_id]?.score
      : student.score === null ? null : Number(student.score)
    return value !== null && value !== undefined
  })
  useEffect(() => {
    if (!gradebook) return
    setDraft(Object.fromEntries(gradebook.students.map(student => [student.student_id, {
      score: student.score === null ? null : Number(student.score), comment: student.comment ?? '',
      submission_status: student.submission_status,
    }])))
  }, [gradebook])
  const refreshAssessmentData = async (assessmentId?: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['assessments', user?.school_id] }),
    assessmentId ? queryClient.invalidateQueries({ queryKey: ['gradebook', user?.school_id, assessmentId] }) : Promise.resolve(),
  ])
  const createMutation = useMutation({
    mutationFn: (values: AssessmentFields) => createAssessment(accessToken!, {
      class_group_id: values.class_group_id, subject_id: values.subject_id, term_id: values.term_id,
      title: values.title.trim(), category: values.category, max_score: String(values.max_score),
      weight_percent: String(values.weight_percent ?? 0), due_on: values.due_on?.format('YYYY-MM-DD') ?? null,
    }),
    onSuccess: async () => {
      await refreshAssessmentData()
      setCreateOpen(false); createForm.resetFields(); toast.success('Assessment created')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const scoreMutation = useMutation({
    mutationFn: () => {
      if (!accessToken || !gradebook) throw new Error('Open an assessment gradebook first')
      const maxScore = Number(gradebook.assessment.max_score)
      const marks = gradebook.students.map(student => {
        const item = draft[student.student_id] ?? { score: null, comment: '', submission_status: 'not_recorded' as const }
        if (item.score !== null && (item.score < 0 || item.score > maxScore)) throw new Error(`Scores must be between 0 and ${maxScore}`)
        return { student_id: student.student_id, score: item.score === null ? null : item.score.toFixed(2), comment: item.comment.trim() || null, submission_status: item.submission_status }
      })
      return saveGradebook(accessToken, gradebook.assessment.id, marks)
    },
    onSuccess: async () => { await refreshAssessmentData(gradebook?.assessment.id); toast.success('Scores saved') },
    onError: error => toast.error(formatApiError(error)),
  })
  const submitMutation = useMutation({
    mutationFn: (assessmentId: string) => submitAssessment(accessToken!, assessmentId),
    onSuccess: async result => { await refreshAssessmentData(result.id); toast.success('Assessment submitted for review') },
    onError: error => toast.error(formatApiError(error)),
  })
  const saveAndSubmit = async () => {
    const assessmentId = gradebook?.assessment.id
    if (!assessmentId) throw new Error('Open an assessment gradebook first')
    await scoreMutation.mutateAsync()
    await submitMutation.mutateAsync(assessmentId)
  }
  const reviewMutation = useMutation({
    mutationFn: (values: ReviewFields) => reviewAssessment(accessToken!, gradebook!.assessment.id, reviewDecision!, values.note),
    onSuccess: async () => {
      await refreshAssessmentData(gradebook?.assessment.id)
      setReviewDecision(null); reviewForm.resetFields()
      toast.success(reviewDecision === 'approve' ? 'Results approved' : 'Assessment returned to the teacher')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const pageError = yearsQuery.error ?? termsQuery.error ?? classesQuery.error ?? subjectsQuery.error ?? assignmentsQuery.error ?? listQuery.error
  const editable = gradebook && ['open', 'returned'].includes(gradebook.assessment.status)
  const assessmentColumns: TableColumnsType<AssessmentSummary> = [
    { title: 'ASSESSMENT', dataIndex: 'title', key: 'title', render: (title: string, row) => <div className="assessment-primary"><strong>{title}</strong><small>{displayCategory(row.category)} · out of {row.max_score}</small></div> },
    { title: 'CLASS & SUBJECT', key: 'class-subject', render: (_, row) => <div className="assessment-primary"><strong>{row.class_name} · {row.subject_name}</strong><small>{row.term_name}{row.due_on ? ` · Due ${dayjs(row.due_on).format('D MMM YYYY')}` : ''}</small></div> },
    { title: 'WEIGHT', dataIndex: 'weight_percent', key: 'weight', render: (value: string) => `${Number(value).toFixed(0)}%` },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={statusColor[value]}>{value}</Tag> },
    { title: '', key: 'actions', align: 'right', render: (_, row) => <Button size="small" onClick={() => setGradebookId(row.id)}>{canReview && row.status === 'submitted' ? 'Review scores' : 'Open gradebook'}</Button> },
  ]
  const gradebookColumns: TableColumnsType<GradebookStudent> = [
    { title: 'STUDENT', key: 'student', render: (_, row) => <div className="assessment-primary"><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></div> },
    ...(gradebook && ['assignment', 'project'].includes(gradebook.assessment.category) ? [{ title: 'WORK STATUS', key: 'submission_status', width: 145, render: (_: unknown, row: GradebookStudent) => <Select value={draft[row.student_id]?.submission_status ?? row.submission_status} disabled={!editable} options={[{ value: 'not_recorded', label: 'Not recorded' }, { value: 'submitted', label: 'Submitted' }, { value: 'missing', label: 'Missing' }, { value: 'excused', label: 'Excused' }]} onChange={value => setDraft(current => ({ ...current, [row.student_id]: { ...(current[row.student_id] ?? { score: null, comment: '', submission_status: 'not_recorded' }), submission_status: value } }))} aria-label={`Assignment status for ${row.first_name} ${row.last_name}`}/> }] : []),
    { title: 'SCORE', key: 'score', width: 160, render: (_, row) => <InputNumber min={0} max={gradebook ? Number(gradebook.assessment.max_score) : undefined} precision={2} step={0.5} value={draft[row.student_id]?.score ?? null} disabled={!editable} onChange={value => setDraft(current => { const previous = current[row.student_id] ?? { score: null, comment: '', submission_status: 'not_recorded' as const }; const status = value !== null && previous.submission_status === 'not_recorded' ? 'submitted' : value === null && previous.submission_status === 'submitted' ? 'not_recorded' : previous.submission_status; return { ...current, [row.student_id]: { ...previous, score: value === null ? null : Number(value), submission_status: status } } })} addonAfter={`/ ${gradebook?.assessment.max_score ?? ''}`} aria-label={`Score for ${row.first_name} ${row.last_name}`}/> },
    { title: 'PERCENT', key: 'percent', width: 100, render: (_, row) => { const value = draft[row.student_id]?.score; return value === null || value === undefined || !gradebook ? '—' : `${((value / Number(gradebook.assessment.max_score)) * 100).toFixed(1)}%` } },
    { title: 'TEACHER COMMENT', key: 'comment', render: (_, row) => <Input maxLength={240} value={draft[row.student_id]?.comment ?? ''} disabled={!editable} placeholder="Optional feedback" onChange={event => setDraft(current => ({ ...current, [row.student_id]: { ...(current[row.student_id] ?? { score: null, comment: '', submission_status: 'not_recorded' }), comment: event.target.value } }))} aria-label={`Comment for ${row.first_name} ${row.last_name}`}/> },
  ]

  return <div className="page-content assessments-page">
    {contextHolder}
    <div className="eyebrow">ACADEMIC OPERATIONS</div>
    <div className="students-heading"><div><h1>Assessment gradebook</h1><p>Set up class assessments, enter scores, and send results for review.</p></div>{canCreate && <Button type="primary" icon={<PlusOutlined/>} onClick={() => { createForm.resetFields(); createForm.setFieldsValue({ class_group_id: classId || undefined, subject_id: selectedSubject || undefined, term_id: termId || undefined, category: 'class_test', max_score: 100, weight_percent: 0 }); setCreateOpen(true) }} disabled={!yearId}>New assessment</Button>}</div>
    {pageError && <Alert type="error" showIcon message="Could not load assessments" description={formatApiError(pageError)} className="student-error"/>}
    <section className="assessment-context panel">
      <div className="assessment-filter"><span>Academic year</span><Select value={yearId || undefined} placeholder="Choose year" onChange={value => { setPeriodYearId(value); setSelectedClass(''); setSelectedSubject('') }} options={years.map((year: AcademicYear) => ({ value: year.id, label: year.name }))}/></div>
      <div className="assessment-filter"><span>Class group</span><Select value={classId || undefined} placeholder="Choose class" onChange={value => { setSelectedClass(value); setSelectedSubject('') }} options={classes.map(group => ({ value: group.id, label: group.name }))} disabled={!classes.length}/></div>
      <div className="assessment-filter"><span>Subject</span><Select value={selectedSubject || undefined} placeholder="All subjects" allowClear onChange={value => setSelectedSubject(value ?? '')} options={subjectOptions} disabled={!classId}/></div>
      <div className="assessment-filter"><span>Term</span><Select value={termId || undefined} placeholder="Choose term" onChange={setPeriodTermId} options={yearTerms.map(term => ({ value: term.id, label: term.name }))}/></div>
    </section>
    <section className="assessment-list panel">
      <div className="assessment-list-heading"><div className="assessment-title"><span className="academic-card-icon"><BookOutlined/></span><div><h2>Assessments</h2><p>{listQuery.data?.length ?? 0} assessments in {years.find(year => year.id === yearId)?.name ?? 'this academic year'}</p></div></div>
        <div className="assessment-summary"><Tag color="blue">{listQuery.data?.filter(item => item.status === 'open').length ?? 0} open</Tag><Tag color="gold">{listQuery.data?.filter(item => item.status === 'submitted').length ?? 0} awaiting review</Tag></div>
      </div>
      <Table<AssessmentSummary> rowKey="id" columns={assessmentColumns} dataSource={(listQuery.data ?? []).filter(item => (!classId || item.class_group_id === classId) && (!selectedSubject || item.subject_id === selectedSubject) && (!termId || item.term_id === termId))} loading={listQuery.isLoading} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={listQuery.isLoading ? 'Loading assessments…' : 'No assessments match these filters'} /> }}/>
    </section>

    <Modal title="Create assessment" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
      <Form form={createForm} layout="vertical" onFinish={values => createMutation.mutate(values)} className="assessment-form">
        <Form.Item name="title" label="Assessment title" rules={[{ required: true, min: 2 }]}><Input maxLength={120} placeholder="Mid-term science test"/></Form.Item>
        <div className="assessment-form-grid">
          <Form.Item name="class_group_id" label="Class group" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" onChange={() => createForm.setFieldValue('subject_id', undefined)} options={classes.map(group => ({ value: group.id, label: group.name }))}/></Form.Item>
          <Form.Item name="subject_id" label="Subject" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={createSubjectOptions} disabled={!formClassId}/></Form.Item>
          <Form.Item name="term_id" label="Term" rules={[{ required: true }]}><Select options={yearTerms.map(term => ({ value: term.id, label: term.name }))}/></Form.Item>
          <Form.Item name="category" label="Assessment type" rules={[{ required: true }]}><Select options={categories}/></Form.Item>
          <Form.Item name="max_score" label="Maximum score" rules={[{ required: true }]}><InputNumber min={0.01} max={1000} precision={2} className="assessment-full"/></Form.Item>
          <Form.Item name="weight_percent" label="Weight in subject (%)"><InputNumber min={0} max={100} precision={2} className="assessment-full"/></Form.Item>
        </div>
        <Form.Item name="due_on" label="Due date"><DatePicker className="assessment-full" format="D MMM YYYY" disabledDate={value => {
          const term = yearTerms.find((item: AcademicTerm) => item.id === createForm.getFieldValue('term_id'))
          return !!term && (value.isBefore(dayjs(term.starts_on), 'day') || value.isAfter(dayjs(term.ends_on), 'day'))
        }}/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={createMutation.isPending}>Create assessment</Button></div>
      </Form>
    </Modal>

    <Modal title={gradebook ? `${gradebook.assessment.title} · ${gradebook.assessment.class_name}` : 'Gradebook'} width={980} open={!!gradebookId} onCancel={() => setGradebookId('')} footer={null} destroyOnClose>
      {gradebookQuery.isLoading && <div className="assessment-loading"><Spin/><span>Loading student scores…</span></div>}
      {gradebookQuery.error && <Alert className="gradebook-load-error" type="error" showIcon message="Could not load this gradebook" description={formatApiError(gradebookQuery.error)}/>}
      {gradebook && <><div className="gradebook-meta"><div><span>{gradebook.assessment.subject_name} · {gradebook.assessment.term_name}</span><strong>Scores out of {gradebook.assessment.max_score} · {Number(gradebook.assessment.weight_percent)}% subject weight</strong></div><Tag color={statusColor[gradebook.assessment.status]}>{gradebook.assessment.status}</Tag></div>
        {gradebook.assessment.review_note && <Alert className="gradebook-review-note" type="warning" showIcon message="Reviewer feedback" description={gradebook.assessment.review_note}/>}
        <Table<GradebookStudent> rowKey="student_id" columns={gradebookColumns} dataSource={gradebook.students} loading={gradebookQuery.isLoading} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No active students are enrolled in this class"/> }}/>
        <div className="gradebook-actions">
          {editable && <span className="gradebook-progress">{gradebook.students.filter(student => draft[student.student_id]?.score !== null && draft[student.student_id]?.score !== undefined).length} of {gradebook.students.length} scores entered</span>}
          {editable && <Button onClick={() => scoreMutation.mutate()} loading={scoreMutation.isPending} icon={<SaveOutlined/>}>Save scores</Button>}
          {editable && <Button type="primary" icon={<CheckOutlined/>} loading={submitMutation.isPending || scoreMutation.isPending} disabled={!allStudentsScored} onClick={() => void saveAndSubmit().catch(() => undefined)}>Submit for review</Button>}
          {canReview && gradebook.assessment.status === 'submitted' && <><Button danger onClick={() => { setReviewDecision('return'); reviewForm.resetFields() }}>Return for correction</Button><Button type="primary" onClick={() => { setReviewDecision('approve'); reviewForm.resetFields() }}>Approve results</Button></>}
          {!editable && gradebook.assessment.status === 'approved' && <Tag color="green">Approved scores are locked</Tag>}
        </div>
      </>}
    </Modal>
    <Modal title={reviewDecision === 'approve' ? 'Approve results' : 'Return assessment for correction'} open={!!reviewDecision} onCancel={() => setReviewDecision(null)} footer={null} destroyOnClose>
      <Form form={reviewForm} layout="vertical" onFinish={values => reviewMutation.mutate(values)}>
        {reviewDecision === 'approve' ? <p className="assessment-review-copy">Approving locks the submitted scores. The teacher will no longer be able to change this assessment.</p> : <Form.Item name="note" label="What needs to be corrected?" rules={[{ required: true, min: 5, message: 'Add at least five characters of feedback' }]}><Input.TextArea rows={4} maxLength={1000} showCount placeholder="Give the teacher clear, actionable feedback"/></Form.Item>}
        <div className="student-form-actions"><Button onClick={() => setReviewDecision(null)}>Cancel</Button><Button type="primary" danger={reviewDecision === 'return'} htmlType="submit" loading={reviewMutation.isPending}>{reviewDecision === 'approve' ? 'Approve and lock' : 'Return to teacher'}</Button></div>
      </Form>
    </Modal>
  </div>
}
