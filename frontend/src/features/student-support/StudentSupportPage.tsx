import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Avatar, Button, Card, DatePicker, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Skeleton, Space, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircleOutlined, CopyOutlined, SearchOutlined, TeamOutlined, UserAddOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import type { StudentSupportRow, SupportIntervention } from '../../shared/api/types'
import { createSupportIntervention, fetchStudentSupport, fetchSupportAssignees, fetchSupportInterventions, inviteSupportStaff, updateSupportIntervention } from './studentSupportApi'

const levelLabels: Record<StudentSupportRow['support_level'], string> = {
  urgent_review: 'Priority review', follow_up: 'Follow-up', monitor: 'Monitor', no_current_signal: 'No current signal',
}
const levelColor: Record<StudentSupportRow['support_level'], string> = {
  urgent_review: 'red', follow_up: 'orange', monitor: 'blue', no_current_signal: 'default',
}
const categoryLabels: Record<string, string> = { attendance: 'Attendance', academic: 'Learning', assignment: 'Assignments', wellbeing: 'Wellbeing', family_contact: 'Family contact', other: 'Other' }
function improvement(baseline: number | null, latest: number | null) {
  if (baseline == null || latest == null) return 'Not enough data'
  const change = Number((latest - baseline).toFixed(1))
  return `${change > 0 ? '+' : ''}${change} pts`
}

export default function StudentSupportPage() {
  const { accessToken, user } = useAuth()
  const { yearId, termId, loading: periodLoading } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('all')
  const [selected, setSelected] = useState<StudentSupportRow | null>(null)
  const [interventionOpen, setInterventionOpen] = useState(false)
  const [editing, setEditing] = useState<SupportIntervention | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [recommendation, setRecommendation] = useState<StudentSupportRow['recommendations'][number] | null>(null)
  const [form] = Form.useForm()
  const [updateForm] = Form.useForm()
  const [inviteForm] = Form.useForm()
  const canAssign = ['school_admin', 'principal', 'registrar'].includes(user?.role ?? '')
  const canCreate = canAssign || user?.role === 'teacher'
  const canInvite = ['school_admin', 'principal'].includes(user?.role ?? '')
  const enabled = !!accessToken && !!yearId && !periodLoading

  const support = useQuery({
    queryKey: ['student-support', user?.school_id, yearId, termId],
    queryFn: () => fetchStudentSupport(accessToken!, yearId, termId || undefined),
    enabled, refetchInterval: 60_000,
  })
  const interventions = useQuery({
    queryKey: ['student-support-interventions', user?.school_id, yearId, termId],
    queryFn: () => fetchSupportInterventions(accessToken!, yearId, termId || undefined), enabled,
  })
  const assignees = useQuery({
    queryKey: ['student-support-assignees', user?.school_id], queryFn: () => fetchSupportAssignees(accessToken!),
    enabled: !!accessToken && canAssign,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['student-support', user?.school_id] })
    void queryClient.invalidateQueries({ queryKey: ['student-support-interventions', user?.school_id] })
  }
  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => createSupportIntervention(accessToken!, {
      student_id: selected!.student_id, academic_year_id: yearId, term_id: termId || null,
      category: values.category as string, title: values.title as string, action: values.action as string,
      assigned_to_membership_id: (values.assigned_to_membership_id as string | undefined) || null,
      follow_up_on: values.follow_up_on ? dayjs(values.follow_up_on as dayjs.ConfigType).format('YYYY-MM-DD') : null,
    }),
    onSuccess: () => { message.success('Support action added to the follow-up plan'); setInterventionOpen(false); form.resetFields(); refresh() },
    onError: error => message.error(formatApiError(error)),
  })
  const updateMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => updateSupportIntervention(accessToken!, editing!.id, {
      status: values.status as string,
      follow_up_on: values.follow_up_on ? dayjs(values.follow_up_on as dayjs.ConfigType).format('YYYY-MM-DD') : null,
      outcome: (values.outcome as string | undefined) || null,
    }),
    onSuccess: () => { message.success('Follow-up record updated'); setEditing(null); refresh() },
    onError: error => message.error(formatApiError(error)),
  })
  const inviteMutation = useMutation({
    mutationFn: (values: { email: string; display_name: string }) => inviteSupportStaff(accessToken!, values),
    onSuccess: result => {
      setInviteLink(`${window.location.origin}/accept-invitation?token=${encodeURIComponent(result.invite_token)}`)
      inviteForm.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['student-support-assignees', user?.school_id] })
    },
    onError: error => message.error(formatApiError(error)),
  })

  const students = support.data?.students ?? []
  const activeStudents = students.filter(row => row.support_level !== 'no_current_signal')
  const filtered = useMemo(() => activeStudents.filter(row => {
    const matchLevel = level === 'all' || row.support_level === level
    const needle = search.trim().toLowerCase()
    return matchLevel && (!needle || `${row.first_name} ${row.last_name} ${row.admission_number} ${row.class_name}`.toLowerCase().includes(needle))
  }), [activeStudents, level, search])
  const openAction = (student: StudentSupportRow, item?: StudentSupportRow['recommendations'][number]) => {
    setSelected(student); setRecommendation(item ?? null)
    form.resetFields()
    form.setFieldsValue(item ? { category: item.category, title: item.title, action: item.action } : {})
    setInterventionOpen(true)
  }
  const columns: ColumnsType<StudentSupportRow> = [
    { title: 'STUDENT', key: 'student', render: (_, row) => <div className="support-student"><Avatar>{row.first_name[0]}{row.last_name[0]}</Avatar><span><strong>{row.first_name} {row.last_name}</strong><small>{row.admission_number}</small></span></div> },
    { title: 'CLASS', dataIndex: 'class_name', key: 'class_name' },
    { title: 'SUPPORT SIGNALS', key: 'signals', render: (_, row) => <div className="support-tags">{row.signals.slice(0, 2).map(signal => <Tag key={signal.key} color={signal.severity === 'concern' ? 'volcano' : 'gold'}>{signal.title}</Tag>)}{row.signal_count > 2 && <Tag>+{row.signal_count - 2}</Tag>}</div> },
    { title: 'REVIEW BAND', key: 'level', render: (_, row) => <Tag color={levelColor[row.support_level]}>{levelLabels[row.support_level]}</Tag> },
    { title: 'REVIEW SCORE', dataIndex: 'support_score', key: 'score', render: (value: number) => <span className="support-score">{value}<small>/100</small></span> },
    { title: '', key: 'action', render: (_, row) => <Button onClick={() => setSelected(row)}>Review</Button> },
  ]

  if (support.isLoading || periodLoading) return <div className="page-content"><Skeleton active paragraph={{ rows: 8 }}/></div>
  if (support.isError) return <div className="page-content"><Alert type="error" showIcon message="Student support signals could not be loaded" description={formatApiError(support.error)} action={<Button onClick={() => void support.refetch()}>Retry</Button>}/></div>

  const summary = support.data!
  const openCount = (interventions.data ?? []).filter(item => ['planned', 'in_progress'].includes(item.status)).length
  return <div className="page-content support-page">
    <div className="support-heading"><div><span className="support-eyebrow">STUDENT SUCCESS · EARLY SUPPORT</span><h1>Student support</h1><p>Review emerging patterns early, agree a helpful next step, and follow progress over time.</p></div><Space wrap>{canInvite && <Button icon={<UserAddOutlined/>} onClick={() => { setInviteLink(''); setInviteOpen(true) }}>Invite counsellor</Button>}<Button icon={<CheckCircleOutlined/>} onClick={() => document.getElementById('support-followups')?.scrollIntoView({ behavior: 'smooth' })}>View follow-ups</Button><Button type="primary" onClick={() => void support.refetch()}>Refresh signals</Button></Space></div>
    <Alert className="support-guidance" type="info" showIcon message="These are explainable review signals, not predictions or decisions." description="A staff member should check the underlying records, speak with the student, and consider their context before taking action. No risk probability is calculated." />
    <div className="support-stat-grid">
      <Card className="support-stat urgent"><span>Priority review</span><strong>{summary.urgent_review}</strong><small>Multiple or stronger signals</small></Card>
      <Card className="support-stat follow"><span>Follow-up suggested</span><strong>{summary.follow_up}</strong><small>Check context and agree a next step</small></Card>
      <Card className="support-stat monitor"><span>Monitor</span><strong>{summary.monitor}</strong><small>Keep an eye on emerging patterns</small></Card>
      <Card className="support-stat tracked"><span>Open support plans</span><strong>{openCount}</strong><small>Planned or in progress</small></Card>
    </div>
    <Card className="support-panel" title={<div><strong>Students for review</strong><small> {summary.academic_year_name}{summary.term_name ? ` · ${summary.term_name}` : ''} · {activeStudents.length} students with current signals</small></div>}>
      <div className="support-toolbar"><Input allowClear prefix={<SearchOutlined/>} placeholder="Search student, ID or class" value={search} onChange={event => setSearch(event.target.value)}/><Select value={level} onChange={setLevel} options={[{ value: 'all', label: 'All review bands' }, { value: 'urgent_review', label: 'Priority review' }, { value: 'follow_up', label: 'Follow-up' }, { value: 'monitor', label: 'Monitor' }]}/></div>
      <Table<StudentSupportRow> rowKey="student_id" columns={columns} dataSource={filtered} pagination={{ pageSize: 8, showSizeChanger: false }} locale={{ emptyText: <Empty description={students.length ? 'No students match these filters' : 'No students have a current support signal in this period'} image={Empty.PRESENTED_IMAGE_SIMPLE}/> }}/>
    </Card>
    <Card id="support-followups" className="support-panel support-followup-panel" title={<div><strong>Follow-up plans</strong><small> Review owner, due date, recorded outcome and change since plan creation</small></div>} extra={<Tag color="blue">{interventions.data?.length ?? 0} total</Tag>}>
      {interventions.isError ? <Alert type="error" message="Follow-up plans could not be loaded" description={formatApiError(interventions.error)}/> : <Table<SupportIntervention> rowKey="id" loading={interventions.isLoading} dataSource={interventions.data ?? []} pagination={{ pageSize: 6, showSizeChanger: false }} locale={{ emptyText: 'No follow-up plans yet. Open a student review to add an action.' }} columns={[
        { title: 'STUDENT', dataIndex: 'student_name', key: 'student', render: (value, row) => <span><strong>{value}</strong><small className="support-subtext">{row.class_name} · {row.admission_number}</small></span> },
        { title: 'SUPPORT ACTION', dataIndex: 'title', key: 'title', render: (value, row) => <span><strong>{value}</strong><small className="support-subtext">{categoryLabels[row.category]} · {row.action}</small></span> },
        { title: 'OWNER', dataIndex: 'assigned_to_name', key: 'owner', render: value => value || 'Unassigned' },
        { title: 'FOLLOW-UP', dataIndex: 'follow_up_on', key: 'follow', render: value => value ? dayjs(value).format('D MMM YYYY') : 'Not set' },
        { title: 'OUTCOME TREND', key: 'trend', render: (_, row) => <span><strong>Attendance {improvement(row.baseline_attendance_rate, row.latest_attendance_rate)}</strong><small className="support-subtext">Assessments {improvement(row.baseline_assessment_average, row.latest_assessment_average)}</small></span> },
        { title: 'STATUS', dataIndex: 'status', key: 'status', render: value => <Tag color={value === 'completed' ? 'green' : value === 'in_progress' ? 'blue' : value === 'cancelled' ? 'default' : 'gold'}>{value.replace('_', ' ')}</Tag> },
        { title: '', key: 'actions', render: (_, row) => row.status !== 'completed' && row.status !== 'cancelled' ? <Button size="small" onClick={() => { setEditing(row); updateForm.setFieldsValue({ status: row.status, follow_up_on: row.follow_up_on ? dayjs(row.follow_up_on) : null, outcome: row.outcome }) }}>Update</Button> : row.outcome ? <Button size="small" onClick={() => Modal.info({ title: 'Recorded outcome', content: row.outcome })}>View outcome</Button> : null },
      ]}/>}
    </Card>

    <Drawer className="support-drawer" title="Student support review" width={560} open={!!selected} onClose={() => setSelected(null)}>
      {selected && <div className="support-review">
        <div className="support-review-identity"><Avatar size={52}>{selected.first_name[0]}{selected.last_name[0]}</Avatar><div><h2>{selected.first_name} {selected.last_name}</h2><span>{selected.admission_number} · {selected.class_name}</span></div><Tag color={levelColor[selected.support_level]}>{levelLabels[selected.support_level]}</Tag></div>
        <Alert type="warning" showIcon message={`Review score ${selected.support_score}/100`} description="This is a transparent sum of the signals below. It is not a probability or a diagnosis."/>
        <section><h3>Signals to check</h3>{selected.signals.length ? selected.signals.map(signal => <div key={signal.key} className="support-signal"><Tag color={signal.severity === 'concern' ? 'volcano' : 'gold'}>{signal.severity === 'concern' ? 'Review' : 'Watch'}</Tag><div><strong>{signal.title}</strong><p>{signal.detail}</p></div></div>) : <Empty description="No current signals" image={Empty.PRESENTED_IMAGE_SIMPLE}/>}</section>
        <section><h3>Record coverage</h3><Descriptions size="small" column={2} items={[
          { key: 'attendance', label: 'Attendance this period', children: selected.attendance_rate == null ? 'Not enough marked days' : `${selected.attendance_rate}%` },
          { key: 'recent', label: 'Recent 30 days', children: selected.recent_attendance_rate == null ? 'Not enough records' : `${selected.recent_attendance_rate}%` },
          { key: 'assessment', label: 'Assessment average', children: selected.assessment_average == null ? 'No marked assessments' : `${selected.assessment_average}%` },
          { key: 'change', label: 'Recent score change', children: selected.assessment_change_points == null ? 'Not enough assessments' : `${selected.assessment_change_points > 0 ? '+' : ''}${selected.assessment_change_points} pts` },
          { key: 'assignments', label: 'Missing assignments', children: selected.missing_assignments },
          { key: 'behavior', label: 'Recent notes for review', children: selected.recent_incidents },
        ]}/></section>
        <section><div className="support-section-title"><h3>Suggested next steps</h3><small>Adapt to the student's situation</small></div>{selected.recommendations.length ? selected.recommendations.map(item => <Card key={item.category} size="small" className="support-recommendation"><div><Tag color="blue">{item.suggested_owner}</Tag><strong>{item.title}</strong><p>{item.action}</p></div>{canCreate && <Button type="primary" ghost onClick={() => openAction(selected, item)}>Track action</Button>}</Card>) : <p className="support-muted">Continue routine check-ins and review new records as they are added.</p>}</section>
        {canCreate && <Button block icon={<TeamOutlined/>} onClick={() => openAction(selected)}>Create a support action</Button>}
      </div>}
    </Drawer>
    <Modal title="Add to support plan" open={interventionOpen} onCancel={() => setInterventionOpen(false)} onOk={() => form.submit()} confirmLoading={createMutation.isPending} okText="Save support action" destroyOnHidden>
      <p className="support-modal-context">For {selected?.first_name} {selected?.last_name}. Keep the plan specific, supportive and agreed with the student where appropriate.</p>
      <Form form={form} layout="vertical" onFinish={values => createMutation.mutate(values)} initialValues={{ category: recommendation?.category }}>
        <Form.Item name="category" label="Support area" rules={[{ required: true }]}><Select options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}/></Form.Item>
        <Form.Item name="title" label="Action title" rules={[{ required: true, min: 3, max: 140 }]}><Input maxLength={140} placeholder="e.g. Weekly attendance check-in"/></Form.Item>
        <Form.Item name="action" label="Plan and next step" rules={[{ required: true, min: 8, max: 3000 }]}><Input.TextArea rows={4} maxLength={3000} placeholder="What will happen, who will support the student, and what will you review?"/></Form.Item>
        {canAssign && <Form.Item name="assigned_to_membership_id" label="Assign to"><Select allowClear placeholder="Choose a teacher or support staff" loading={assignees.isLoading} options={(assignees.data ?? []).map(item => ({ value: item.membership_id, label: `${item.display_name} · ${item.role.replace('_', ' ')}` }))}/></Form.Item>}
        <Form.Item name="follow_up_on" label="Follow-up date"><DatePicker className="support-full-width" disabledDate={date => date.isBefore(dayjs(), 'day')}/></Form.Item>
      </Form>
    </Modal>
    <Modal title="Update support follow-up" open={!!editing} onCancel={() => setEditing(null)} onOk={() => updateForm.submit()} confirmLoading={updateMutation.isPending} okText="Save update" destroyOnHidden>
      <p className="support-modal-context">Record what happened and what you observed. An outcome can be reviewed alongside future attendance and assessment records.</p>
      <Form form={updateForm} layout="vertical" onFinish={values => updateMutation.mutate(values)}>
        <Form.Item name="status" label="Status" rules={[{ required: true }]}><Select options={[{ value: 'planned', label: 'Planned' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }]}/></Form.Item>
        <Form.Item name="follow_up_on" label="Follow-up date"><DatePicker className="support-full-width"/></Form.Item>
        <Form.Item name="outcome" label="Outcome / progress note"><Input.TextArea rows={4} maxLength={3000} placeholder="What changed after the support action? Note evidence and any next step."/></Form.Item>
      </Form>
    </Modal>
    <Modal title="Invite a counsellor or support staff member" open={inviteOpen} onCancel={() => { setInviteOpen(false); inviteForm.resetFields(); setInviteLink('') }} onOk={() => inviteLink ? setInviteOpen(false) : inviteForm.submit()} confirmLoading={inviteMutation.isPending} okText={inviteLink ? 'Done' : 'Create invitation'} destroyOnHidden>
      {inviteLink ? <div className="support-invite-result"><Alert type="success" showIcon message="Invitation link ready" description="Share this single-use link with the counsellor. It expires in seven days."/><Input value={inviteLink} readOnly addonAfter={<Button type="text" icon={<CopyOutlined/>} onClick={() => { void navigator.clipboard.writeText(inviteLink); message.success('Invitation link copied') }}>Copy</Button>}/></div> : <Form form={inviteForm} layout="vertical" onFinish={values => inviteMutation.mutate(values)}>
        <p className="support-modal-context">Counsellors receive access only to students with an action assigned to them. They can record progress and outcomes, but cannot view the full school roster or assign actions.</p>
        <Form.Item name="display_name" label="Full name" rules={[{ required: true, min: 2, max: 160 }]}><Input maxLength={160}/></Form.Item>
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input type="email"/></Form.Item>
      </Form>}
    </Modal>
  </div>
}
