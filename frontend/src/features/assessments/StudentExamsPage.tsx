import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, Input, Radio, Spin, Tag, message } from 'antd'
import { ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import type { OnlineExamCard } from '../../shared/api/types'
import { fetchStudentExamAttempt, fetchStudentExams, saveStudentAnswers, startStudentExam, submitStudentExam } from './assessmentsApi'

type Sitting = Awaited<ReturnType<typeof startStudentExam>>
type Answer = { question_id: string; selected_option_id: string | null; written_answer: string | null }

function timeLeft(deadline: string, now: number) {
  const seconds = Math.max(0, Math.floor((new Date(deadline).getTime() - now) / 1000))
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

export default function StudentExamsPage() {
  const { accessToken, user } = useAuth()
  const client = useQueryClient()
  const [toast, holder] = message.useMessage()
  const [active, setActive] = useState<Sitting | null>(null)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [now, setNow] = useState(Date.now())
  const examsQuery = useQuery({ queryKey: ['student-exams', user?.school_id], queryFn: () => fetchStudentExams(accessToken!), enabled: !!accessToken, refetchInterval: 60_000 })
  const startMutation = useMutation({
    mutationFn: (exam: OnlineExamCard) => startStudentExam(accessToken!, exam.id),
    onSuccess: async sitting => {
      const saved = await fetchStudentExamAttempt(accessToken!, sitting.attempt_id)
      const resumed = { ...sitting, ...saved }
      setActive(resumed)
      setAnswers(Object.fromEntries((saved.answers ?? []).map(answer => [answer.question_id, answer])))
      setNow(Date.now())
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const submitMutation = useMutation({
    mutationFn: () => {
      if (!active) throw new Error('No active exam sitting')
      return submitStudentExam(accessToken!, active.attempt_id, Object.values(answers))
    },
    onSuccess: async result => {
      setActive(null)
      setAnswers({})
      await client.invalidateQueries({ queryKey: ['student-exams', user?.school_id] })
      toast.success(result.awaiting_teacher_review ? 'Exam submitted. Your teacher will review the written answers.' : 'Exam submitted and scored.')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const answerList = useMemo(() => Object.values(answers), [answers])
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  useEffect(() => {
    if (!active || !answerList.length) return
    const timer = window.setTimeout(() => {
      void saveStudentAnswers(accessToken!, active.attempt_id, answerList).catch(error => toast.error(`Could not save your answers: ${formatApiError(error)}`))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [active, answerList, accessToken, toast])
  const remaining = active ? timeLeft(active.deadline_at, now) : ''
  useEffect(() => {
    if (active && remaining === '00:00' && !submitMutation.isPending) submitMutation.mutate()
  }, [active, remaining])

  if (examsQuery.isLoading) return <div className="page-content"><div className="attendance-loading"><Spin size="large"/><span>Loading your exams…</span></div></div>
  if (examsQuery.error) return <div className="page-content"><Alert type="error" showIcon message="Could not load your exams" description={formatApiError(examsQuery.error)}/></div>
  const exams = examsQuery.data ?? []
  const setAnswer = (questionId: string, patch: Partial<Answer>) => setAnswers(current => {
    const previous = current[questionId] ?? { question_id: questionId, selected_option_id: null, written_answer: null }
    return { ...current, [questionId]: { ...previous, ...patch } }
  })

  return <div className="page-content student-exams-page">
    {holder}
    {active ? <section className="student-sitting-panel">
      <header className="student-sitting-header"><div><span className="eyebrow">ONLINE EXAM · {active.exam.class_name}</span><h1>{active.exam.title}</h1><p>{active.exam.instructions}</p></div><div className={`student-exam-clock${remaining.startsWith('00:') ? ' urgent' : ''}`} role="timer" aria-live="polite"><ClockCircleOutlined/><span>{remaining}</span><small>time left</small></div></header>
      <div className="student-exam-progress">{active.exam.questions.length} questions <span>·</span> {Object.values(answers).filter(answer => answer.selected_option_id || answer.written_answer?.trim()).length} answered <span>·</span> Your answers save automatically</div>
      <div className="student-exam-question-list">{active.exam.questions.map((question, index) => <Card className="student-exam-question" key={question.id} bordered={false}>
        <div className="student-exam-question-heading"><span>QUESTION {index + 1}</span><Tag>{question.points} marks</Tag></div>
        <h2>{question.text}</h2>
        {question.type === 'multiple_choice' ? <Radio.Group className="student-exam-options" value={answers[question.id]?.selected_option_id ?? undefined} onChange={event => setAnswer(question.id, { selected_option_id: event.target.value })}>
          {question.options.map((option, optionIndex) => <Radio value={option.id} key={option.id}><b>{String.fromCharCode(65 + optionIndex)}.</b> {option.text}</Radio>)}
        </Radio.Group> : <Input.TextArea rows={5} maxLength={12000} showCount value={answers[question.id]?.written_answer ?? ''} onChange={event => setAnswer(question.id, { written_answer: event.target.value })} placeholder="Write your answer here"/>}
      </Card>)}</div>
      <div className="student-exam-submit-row"><span>Check your work before submitting. You can submit only once.</span><Button type="primary" size="large" loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>Submit exam</Button></div>
    </section> : <>
      <div className="students-heading"><div><div className="eyebrow">STUDENT WORKSPACE</div><h1>My exams</h1><p>View and sit timed exams assigned to your classes.</p></div></div>
      <section className="student-exam-card-grid">{exams.length ? exams.map(exam => <Card className="student-exam-card" bordered={false} key={exam.id}>
        <div className="student-exam-card-top"><span>CLASS EXAM</span><Tag color={exam.attempt_status === 'reviewed' ? 'green' : exam.attempt_status === 'submitted' ? 'gold' : exam.attempt_status === 'in_progress' ? 'blue' : 'default'}>{exam.attempt_status.replace('_', ' ')}</Tag></div>
        <h2>{exam.title}</h2><p>{exam.instructions || 'Timed exam · read all questions carefully.'}</p>
        <div className="student-exam-card-meta"><span><ClockCircleOutlined/> {exam.duration_minutes} minutes</span>{exam.closes_at && <span>Closes {new Date(exam.closes_at).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>}{exam.score != null && <strong>Score: {exam.score}</strong>}</div>
        <Button type="primary" icon={<PlayCircleOutlined/>} disabled={['submitted', 'reviewed'].includes(exam.attempt_status)} loading={startMutation.isPending && startMutation.variables?.id === exam.id} onClick={() => startMutation.mutate(exam)}>{exam.attempt_status === 'in_progress' ? 'Continue exam' : 'Start exam'}</Button>
      </Card>) : <div className="student-exams-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No exams are available right now. Published exams for your class will appear here."/></div>}</section>
    </>}
  </div>
}
