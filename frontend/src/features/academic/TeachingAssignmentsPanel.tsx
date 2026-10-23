import { useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Select, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CopyOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import type { ClassGroup, TeachingAssignment } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { createSubject, createTeachingAssignment, fetchSubjects, fetchTeachers, fetchTeachingAssignments, inviteTeacher } from './teachingApi'

type InviteFields = { display_name: string; email: string }
type SubjectFields = { code: string; name: string }
type AssignmentFields = { class_group_id: string; subject_id: string; teacher_membership_id: string }

export function TeachingAssignmentsPanel({ yearId, classes }: { yearId: string; classes: ClassGroup[] }) {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [inviteForm] = Form.useForm<InviteFields>()
  const [subjectForm] = Form.useForm<SubjectFields>()
  const [assignmentForm] = Form.useForm<AssignmentFields>()
  const canManage = ['school_admin', 'registrar'].includes(user?.role ?? '')
  const canInvite = user?.role === 'school_admin'
  const subjectsQuery = useQuery({ queryKey: ['subjects', user?.school_id], queryFn: () => fetchSubjects(accessToken!), enabled: !!accessToken })
  const teachersQuery = useQuery({ queryKey: ['teachers', user?.school_id], queryFn: () => fetchTeachers(accessToken!), enabled: !!accessToken && canManage })
  const assignmentsQuery = useQuery({
    queryKey: ['teaching-assignments', user?.school_id, yearId],
    queryFn: () => fetchTeachingAssignments(accessToken!, yearId), enabled: !!accessToken && !!yearId,
  })
  const invalidate = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['subjects', user?.school_id] }),
    queryClient.invalidateQueries({ queryKey: ['teachers', user?.school_id] }),
    queryClient.invalidateQueries({ queryKey: ['teaching-assignments', user?.school_id] }),
  ])
  const subjectMutation = useMutation({
    mutationFn: (values: SubjectFields) => createSubject(accessToken!, values),
    onSuccess: async () => { await invalidate(); setSubjectOpen(false); subjectForm.resetFields(); toast.success('Subject created') },
    onError: error => toast.error(formatApiError(error)),
  })
  const assignmentMutation = useMutation({
    mutationFn: (values: AssignmentFields) => createTeachingAssignment(accessToken!, values),
    onSuccess: async () => { await invalidate(); setAssignmentOpen(false); assignmentForm.resetFields(); toast.success('Teacher assigned to class and subject') },
    onError: error => toast.error(formatApiError(error)),
  })
  const inviteMutation = useMutation({
    mutationFn: (values: InviteFields) => inviteTeacher(accessToken!, values),
    onSuccess: async result => {
      await invalidate()
      const url = `${window.location.origin}/accept-invitation?token=${encodeURIComponent(result.invite_token)}`
      setCreatedInviteUrl(url)
      inviteForm.resetFields()
      toast.success('Teacher invitation created')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const copyInvite = async () => {
    await navigator.clipboard.writeText(createdInviteUrl)
    toast.success('Invitation link copied')
  }
  const columns: TableColumnsType<TeachingAssignment> = [
    { title: 'CLASS', dataIndex: 'class_name', key: 'class' },
    { title: 'SUBJECT', dataIndex: 'subject_name', key: 'subject', render: (name: string, row) => <span>{name} <Tag>{row.subject_code}</Tag></span> },
    { title: 'TEACHER', dataIndex: 'teacher_name', key: 'teacher', render: (name: string, row) => <div className="academic-person"><strong>{name}</strong><small>{row.teacher_email}</small></div> },
  ]
  const pageError = subjectsQuery.error ?? assignmentsQuery.error ?? teachersQuery.error

  return <section className="academic-section panel teaching-panel">
    {contextHolder}
    <div className="academic-card-heading"><div><span className="academic-card-icon"><TeamOutlined /></span><div><h2>Subjects &amp; teaching assignments</h2><p>Connect teachers to the classes and subjects they are responsible for.</p></div></div>
      <div className="teaching-actions">
        {canInvite && <Button size="small" onClick={() => { setCreatedInviteUrl(''); setInviteOpen(true) }}>Invite teacher</Button>}
        {canManage && <Button size="small" onClick={() => setSubjectOpen(true)}>Add subject</Button>}
        {canManage && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAssignmentOpen(true)} disabled={!classes.length || !subjectsQuery.data?.length || !teachersQuery.data?.length}>Assign teacher</Button>}
      </div>
    </div>
    {pageError && <Alert type="error" showIcon message="Could not load teaching assignments" description={formatApiError(pageError)} className="student-error"/>}
    {assignmentsQuery.data?.length ? <Table<TeachingAssignment> rowKey="id" columns={columns} dataSource={assignmentsQuery.data} loading={assignmentsQuery.isLoading} pagination={{ pageSize: 6, showSizeChanger: false }} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={assignmentsQuery.isLoading ? 'Loading assignments…' : 'No teachers are assigned for this year yet'} />}

    <Modal title="Invite a teacher" open={inviteOpen} onCancel={() => { setInviteOpen(false); setCreatedInviteUrl('') }} footer={null} destroyOnClose>
      {createdInviteUrl ? <div className="invite-success"><Alert type="success" showIcon message="Invitation ready" description="Share this one-time link with the teacher. It expires in seven days."/><Input value={createdInviteUrl} readOnly/><Button icon={<CopyOutlined />} onClick={() => void copyInvite()}>Copy invitation link</Button><p>The invitation token is shown only once. If it is lost, create a new invitation.</p></div>
        : <Form form={inviteForm} layout="vertical" onFinish={values => inviteMutation.mutate(values)}>
          <p className="form-hint">The teacher will join this school with a teacher account and can set a password if they are new to SchoolOS.</p>
          <Form.Item name="display_name" label="Teacher name" rules={[{ required: true, min: 2 }]}><Input maxLength={160} placeholder="Full name"/></Form.Item>
          <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input type="email" maxLength={254} placeholder="teacher@school.edu.gh"/></Form.Item>
          <div className="student-form-actions"><Button onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>Create invitation</Button></div>
        </Form>}
    </Modal>
    <Modal title="Add a subject" open={subjectOpen} onCancel={() => setSubjectOpen(false)} footer={null} destroyOnClose>
      <Form form={subjectForm} layout="vertical" onFinish={values => subjectMutation.mutate(values)}>
        <Form.Item name="name" label="Subject name" rules={[{ required: true, min: 2 }]}><Input maxLength={100} placeholder="Integrated Science"/></Form.Item>
        <Form.Item name="code" label="Subject code" rules={[{ required: true, min: 2 }]}><Input maxLength={24} placeholder="SCI"/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setSubjectOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={subjectMutation.isPending}>Add subject</Button></div>
      </Form>
    </Modal>
    <Modal title="Assign a teacher" open={assignmentOpen} onCancel={() => setAssignmentOpen(false)} footer={null} destroyOnClose>
      <Form form={assignmentForm} layout="vertical" onFinish={values => assignmentMutation.mutate(values)}>
        <Form.Item name="class_group_id" label="Class group" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={classes.map(group => ({ value: group.id, label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}` }))}/></Form.Item>
        <Form.Item name="subject_id" label="Subject" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(subjectsQuery.data ?? []).map(subject => ({ value: subject.id, label: `${subject.name} · ${subject.code}` }))}/></Form.Item>
        <Form.Item name="teacher_membership_id" label="Teacher" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(teachersQuery.data ?? []).map(teacher => ({ value: teacher.membership_id, label: `${teacher.display_name} · ${teacher.email}` }))}/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setAssignmentOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={assignmentMutation.isPending}>Save assignment</Button></div>
      </Form>
    </Modal>
  </section>
}
