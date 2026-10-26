import { useEffect, useMemo, useState } from 'react'
import dayjs, { type Dayjs } from 'dayjs'
import {
  Alert, Button, Checkbox, DatePicker, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Table, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { ClockCircleOutlined, EyeOutlined, PrinterOutlined, SaveOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { ApiRequestError } from '../../shared/api/client'
import type { AssessmentSummary } from '../../shared/api/types'
import { fetchExamAttempts, fetchOnlineExam, markExamAttempt, saveOnlineExam, toggleOnlineExam, type ExamAttempt, type ExamSetupDraft } from './assessmentsApi'

type QuestionForm = { text: string; type: 'multiple_choice' | 'written'; points: number; options?: { text: string; correct: boolean }[] }
type ExamFormValues = { duration_minutes: number; instructions?: string; opens_at?: Dayjs | null; closes_at?: Dayjs | null; questions: QuestionForm[] }

function defaultQuestion(points = 10): QuestionForm {
  return { text: '', type: 'multiple_choice', points, options: [{ text: '', correct: true }, { text: '', correct: false }, { text: '', correct: false }, { text: '', correct: false }] }
}

export default function OnlineExamTools({ assessment }: { assessment: AssessmentSummary }) {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [toast, holder] = message.useMessage()
  const [builderOpen, setBuilderOpen] = useState(false)
  const [attemptsOpen, setAttemptsOpen] = useState(false)
  const [printKey, setPrintKey] = useState(false)
  const [selectedAttempt, setSelectedAttempt] = useState<ExamAttempt | null>(null)
  const [marks, setMarks] = useState<Record<string, { points_awarded: number | null; feedback: string }>>({})
  const [form] = Form.useForm<ExamFormValues>()
  const examQuery = useQuery({ queryKey: ['online-exam', user?.school_id, assessment.id], queryFn: () => fetchOnlineExam(accessToken!, assessment.id), enabled: !!accessToken && builderOpen, retry: false })
  const attemptsQuery = useQuery({ queryKey: ['exam-attempts', user?.school_id, assessment.id], queryFn: () => fetchExamAttempts(accessToken!, assessment.id), enabled: !!accessToken && attemptsOpen })
  useEffect(() => {
    if (!builderOpen) return
    const exam = examQuery.data
    if (!exam) {
      form.resetFields()
      form.setFieldsValue({ duration_minutes: 60, instructions: 'Read each question carefully. Your answers are saved as you work.', questions: [defaultQuestion(Number(assessment.max_score))] })
      return
    }
    form.setFieldsValue({ duration_minutes: exam.duration_minutes, instructions: exam.instructions ?? '',
      opens_at: exam.opens_at ? dayjs(exam.opens_at) : null, closes_at: exam.closes_at ? dayjs(exam.closes_at) : null,
      questions: exam.questions.map(question => ({ text: question.text, type: question.type, points: Number(question.points),
        options: question.options.map(option => ({ text: option.text, correct: option.correct ?? false })) })) })
  }, [builderOpen, examQuery.data, form])

  const saveMutation = useMutation({
    mutationFn: (values: ExamSetupDraft) => saveOnlineExam(accessToken!, assessment.id, values),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['online-exam', user?.school_id, assessment.id] }); toast.success('Exam saved'); },
    onError: error => toast.error(formatApiError(error)),
  })
  const publishMutation = useMutation({
    mutationFn: () => toggleOnlineExam(accessToken!, assessment.id),
    onSuccess: async result => { await queryClient.invalidateQueries({ queryKey: ['online-exam', user?.school_id, assessment.id] }); toast.success(result.published ? 'Exam published to enrolled students' : 'Exam unpublished'); },
    onError: error => toast.error(formatApiError(error)),
  })
  const reviewMutation = useMutation({
    mutationFn: () => {
      if (!selectedAttempt) throw new Error('Select a student sitting first')
      const written = selectedAttempt.answers.filter(answer => answer.type === 'written')
      return markExamAttempt(accessToken!, selectedAttempt.id, written.map(answer => {
        const mark = marks[answer.question_id]
        if (mark?.points_awarded == null) throw new Error('Enter a score for every written answer')
        return { question_id: answer.question_id, points_awarded: String(mark.points_awarded), feedback: mark.feedback.trim() || null }
      }))
    },
    onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['exam-attempts', user?.school_id, assessment.id] }), queryClient.invalidateQueries({ queryKey: ['gradebook', user?.school_id] }), queryClient.invalidateQueries({ queryKey: ['assessments', user?.school_id] })]); setSelectedAttempt(null); toast.success('Exam marked and score added to the gradebook'); },
    onError: error => toast.error(formatApiError(error)),
  })
  const exam = examQuery.data
  const questionTotal = Form.useWatch('questions', form) ?? []
  const totalPoints = useMemo(() => questionTotal.reduce((sum, question) => sum + (Number(question?.points) || 0), 0), [questionTotal])
  const attempts = attemptsQuery.data?.attempts ?? []

  const handleSave = (values: ExamFormValues) => {
    if (Math.abs(totalPoints - Number(assessment.max_score)) > .001) {
      toast.error(`Question points total ${totalPoints}; set the total to ${assessment.max_score} to match the gradebook.`)
      return
    }
    const payload: ExamSetupDraft = {
      duration_minutes: values.duration_minutes, instructions: values.instructions?.trim() || null,
      opens_at: values.opens_at?.toISOString() ?? null, closes_at: values.closes_at?.toISOString() ?? null,
      questions: values.questions.map(question => ({ text: question.text.trim(), type: question.type,
        points: String(question.points), options: question.type === 'multiple_choice' ? (question.options ?? []).map(option => ({ text: option.text.trim(), correct: !!option.correct })) : [] })),
    }
    saveMutation.mutate(payload)
  }
  const startPrint = (key: boolean) => { setPrintKey(key); window.setTimeout(() => window.print(), 60) }

  const attemptColumns: TableColumnsType<ExamAttempt> = [
    { title: 'STUDENT', key: 'student', render: (_, row) => <div className="assessment-primary"><strong>{row.student_name}</strong><small>{row.admission_number}</small></div> },
    { title: 'SUBMITTED', dataIndex: 'submitted_at', key: 'submitted', render: value => value ? dayjs(value).format('D MMM, h:mm A') : '—' },
    { title: 'SCORE', dataIndex: 'score', key: 'score', render: (value, row) => value == null ? <Tag color="gold">Awaiting marking</Tag> : row.status === 'reviewed' ? `${value} / ${assessment.max_score}` : <Tag color="blue">Auto-scored · review pending</Tag> },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: value => <Tag color={value === 'reviewed' ? 'green' : value === 'submitted' ? 'gold' : 'blue'}>{value.replace('_', ' ')}</Tag> },
    { title: '', key: 'action', align: 'right', render: (_, row) => <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedAttempt(row); setMarks(Object.fromEntries(row.answers.filter(answer => answer.type === 'written').map(answer => [answer.question_id, { points_awarded: answer.points_awarded == null ? null : Number(answer.points_awarded), feedback: answer.feedback ?? '' }]))); }}>Review</Button> },
  ]

  return <>
    {holder}
    <Space size={6} wrap>
      <Button size="small" icon={<ClockCircleOutlined />} onClick={() => { setBuilderOpen(true); }}> {exam?.published ? 'Manage exam' : 'Build exam'}</Button>
      <Button size="small" onClick={() => setAttemptsOpen(true)}>Student sittings</Button>
    </Space>

    <Modal title={<div className="exam-modal-title"><span>{assessment.title}</span><small>{assessment.class_name} · {assessment.subject_name} · Online exam builder</small></div>}
      width={960} open={builderOpen} onCancel={() => setBuilderOpen(false)} footer={null} destroyOnClose>
      {examQuery.isLoading && <div className="assessment-loading"><Spin/><span>Loading exam setup…</span></div>}
      {examQuery.error && !exam && <Alert type="info" showIcon message="Set up an online exam" description="Add questions and a timer. The exam stays private until you publish it." className="exam-info"/>}
      {examQuery.error && !(examQuery.error instanceof ApiRequestError && examQuery.error.status === 404) && <Alert type="error" showIcon message="Could not load exam setup" description={formatApiError(examQuery.error)}/>}
      {(!examQuery.isLoading || exam) && <Form form={form} layout="vertical" onFinish={handleSave} className="exam-builder-form">
        <div className="exam-settings-grid">
          <Form.Item name="duration_minutes" label="Time allowed (minutes)" rules={[{ required: true }]}><InputNumber min={1} max={480} className="assessment-full"/></Form.Item>
          <Form.Item label="Question total"><div className={`exam-points-total${Math.abs(totalPoints - Number(assessment.max_score)) < .001 ? ' matched' : ''}`}>{totalPoints} <span>/ {assessment.max_score} marks</span></div></Form.Item>
          <Form.Item name="opens_at" label="Opens (optional)"><DatePicker showTime className="assessment-full" format="D MMM YYYY, h:mm A"/></Form.Item>
          <Form.Item name="closes_at" label="Closes (optional)"><DatePicker showTime className="assessment-full" format="D MMM YYYY, h:mm A"/></Form.Item>
        </div>
        <Form.Item name="instructions" label="Student instructions"><Input.TextArea rows={2} maxLength={3000} placeholder="Read each question carefully…"/></Form.Item>
        <Form.List name="questions">
          {(fields, { add, remove }) => <div className="exam-question-list">
            {fields.map((field, index) => <QuestionEditor key={field.key} field={field} index={index} onRemove={() => remove(field.name)} canRemove={fields.length > 1}/>) }
            <Button onClick={() => add(defaultQuestion())}>+ Add question</Button>
          </div>}
        </Form.List>
        <div className="exam-builder-actions">
          <Button icon={<PrinterOutlined />} disabled={!exam?.questions.length} onClick={() => startPrint(false)}>Print paper</Button>
          <Button icon={<EyeOutlined />} disabled={!exam?.questions.length} onClick={() => startPrint(true)}>Print marking key</Button>
          <span className="exam-action-spacer"/>
          {exam && <Button onClick={() => setAttemptsOpen(true)}>View sittings</Button>}
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>Save exam</Button>
          {exam && <Button type={exam.published ? 'default' : 'primary'} danger={exam.published} loading={publishMutation.isPending} onClick={() => publishMutation.mutate()}>{exam.published ? 'Unpublish' : 'Publish to students'}</Button>}
        </div>
        {exam?.published && <p className="exam-published-note">Published students in {assessment.class_name} can start one timed sitting each. Editing is locked until the exam is unpublished, and no sitting has started.</p>}
      </Form>}
    </Modal>

    <Modal title={`Online exam sittings · ${assessment.title}`} width={900} open={attemptsOpen} onCancel={() => setAttemptsOpen(false)} footer={null} destroyOnClose>
      {attemptsQuery.error && <Alert type="error" showIcon message="Could not load exam sittings" description={formatApiError(attemptsQuery.error)}/>}
      <Table rowKey="id" columns={attemptColumns} dataSource={attempts} loading={attemptsQuery.isLoading} pagination={{ pageSize: 8 }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No students have started this exam"/> }}/>
    </Modal>

    <Modal title={selectedAttempt ? `Mark exam · ${selectedAttempt.student_name}` : 'Mark exam'} open={!!selectedAttempt} onCancel={() => setSelectedAttempt(null)} footer={null} width={840} destroyOnClose>
      {selectedAttempt && <div className="exam-marking-list">{selectedAttempt.answers.map(answer => <article className="exam-marking-question" key={answer.question_id}>
        <div className="exam-marking-prompt"><span>{answer.type === 'written' ? 'WRITTEN RESPONSE' : 'MULTIPLE CHOICE'} · {answer.max_points} marks</span><strong>{answer.question}</strong><p>{answer.written_answer || answer.selected_option || 'No response entered'}</p></div>
        {answer.type === 'written' ? <div className="exam-marking-controls"><InputNumber min={0} max={Number(answer.max_points)} value={marks[answer.question_id]?.points_awarded ?? null} placeholder="Score" onChange={value => setMarks(current => ({ ...current, [answer.question_id]: { ...(current[answer.question_id] ?? { points_awarded: null, feedback: '' }), points_awarded: value == null ? null : Number(value) } }))}/><Input value={marks[answer.question_id]?.feedback ?? ''} maxLength={1000} placeholder="Optional feedback" onChange={event => setMarks(current => ({ ...current, [answer.question_id]: { ...(current[answer.question_id] ?? { points_awarded: null, feedback: '' }), feedback: event.target.value } }))}/></div> : <Tag color="blue">Auto-scored · review answer</Tag>}
      </article>)}
      <div className="exam-marking-actions"><Button onClick={() => setSelectedAttempt(null)}>Close</Button><Button type="primary" loading={reviewMutation.isPending} disabled={selectedAttempt.status === 'reviewed'} onClick={() => reviewMutation.mutate()}>Approve and save to gradebook</Button></div></div>}
    </Modal>

    {exam?.questions.length ? <div className={`exam-print-page${printKey ? ' show-key' : ''}`} aria-hidden="true">
      <h1>{assessment.title}</h1><p>{assessment.class_name} · {assessment.subject_name} · {assessment.term_name}</p><p>Name: ___________________________________  Date: __________________</p>
      <div className="exam-print-meta">Time allowed: {exam.duration_minutes} minutes · Total: {assessment.max_score} marks</div>
      {exam.instructions && <p className="exam-print-instructions">Instructions: {exam.instructions}</p>}
      {exam.questions.map((question, index) => <section key={question.id} className="exam-print-question"><strong>{index + 1}. {question.text}</strong><span>({question.points} marks)</span>
        {question.type === 'multiple_choice' ? <ol type="A">{question.options.map(option => <li key={option.id}>{option.text}{printKey && option.correct ? ' ✓' : ''}</li>)}</ol> : <div className="exam-print-answer-lines"/>}
        {printKey && question.type === 'written' && <p className="exam-key-note">Teacher marking: ______ / {question.points}</p>}
      </section>)}
    </div> : null}
  </>
}

function QuestionEditor({ field, index, onRemove, canRemove }: { field: { key: number; name: number }; index: number; onRemove: () => void; canRemove: boolean }) {
  const form = Form.useFormInstance<ExamFormValues>()
  const type = Form.useWatch(['questions', field.name, 'type'], form) ?? 'multiple_choice'
  return <article className="exam-question-editor">
    <div className="exam-question-editor-heading"><strong>Question {index + 1}</strong><Button type="text" danger disabled={!canRemove} onClick={onRemove}>Remove</Button></div>
    <div className="exam-question-fields">
      <Form.Item name={[field.name, 'text']} label="Question" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={2} maxLength={4000}/></Form.Item>
      <Form.Item name={[field.name, 'type']} label="Response type"><Select options={[{ value: 'multiple_choice', label: 'Multiple choice' }, { value: 'written', label: 'Written response' }]}/></Form.Item>
      <Form.Item name={[field.name, 'points']} label="Marks"><InputNumber min={0.01} max={1000} precision={2} className="assessment-full"/></Form.Item>
    </div>
    {type === 'multiple_choice' && <Form.List name={[field.name, 'options']}>
      {(options, { add, remove }) => <div className="exam-option-list"><span>Answer options · tick exactly one correct answer</span>
        {options.map(option => <div className="exam-option-row" key={option.key}><Form.Item name={[option.name, 'text']} rules={[{ required: true, min: 1 }]}><Input placeholder="Option text" maxLength={500}/></Form.Item><Form.Item name={[option.name, 'correct']} valuePropName="checked"><Checkbox>Correct</Checkbox></Form.Item><Button type="text" danger disabled={options.length <= 2} onClick={() => remove(option.name)} aria-label="Remove answer option">×</Button></div>)}
        {options.length < 8 && <Button size="small" onClick={() => add({ text: '', correct: false })}>+ Add option</Button>}
      </div>}
    </Form.List>}
  </article>
}
