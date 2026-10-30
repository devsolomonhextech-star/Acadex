import { useState } from 'react'
import { Alert, Button, Dropdown, Empty, Form, Input, Modal, Popconfirm, Select, Table, Tabs, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DownOutlined, IdcardOutlined, MailOutlined, PlusOutlined, TeamOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import type { ClassGroup, Teacher, TeachingAssignment } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { createSubject, createTeachingAssignment, fetchSubjects, fetchTeachers, fetchTeachingAssignments, inviteTeacher, setClassTeacher } from './teachingApi'
import { createTeacherAccount } from './staffAdminApi'

type InviteFields = { display_name: string; email: string }
type DirectFields = { display_name: string; email: string; password: string }
type SubjectFields = { code: string; name: string }
type AssignmentFields = { class_group_id: string; subject_id: string; teacher_membership_id: string }
type ClassTeacherFields = { class_group_id: string; teacher_membership_id: string }

function person(name: string, caption?: string) {
  return <div className="academic-person"><strong>{name}</strong>{caption ? <small>{caption}</small> : null}</div>
}

function workload(teacher: Teacher) {
  const classes = teacher.classes_taught ?? 0
  const subjects = teacher.subjects_taught ?? 0
  return `${classes} ${classes === 1 ? 'class' : 'classes'} · ${subjects} ${subjects === 1 ? 'subject' : 'subjects'}`
}

export function TeachingAssignmentsPanel({ yearId, classes }: { yearId: string; classes: ClassGroup[] }) {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [directOpen, setDirectOpen] = useState(false)
  const [subjectOpen, setSubjectOpen] = useState(false)
  const [assignmentOpen, setAssignmentOpen] = useState(false)
  const [classTeacherOpen, setClassTeacherOpen] = useState(false)
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [inviteForm] = Form.useForm<InviteFields>()
  const [directForm] = Form.useForm<DirectFields>()
  const [subjectForm] = Form.useForm<SubjectFields>()
  const [assignmentForm] = Form.useForm<AssignmentFields>()
  const [classTeacherForm] = Form.useForm<ClassTeacherFields>()
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
    queryClient.invalidateQueries({ queryKey: ['class-groups', user?.school_id] }),
  ])
  const subjectMutation = useMutation({
    mutationFn: (values: SubjectFields) => createSubject(accessToken!, values),
    onSuccess: async () => { await invalidate(); setSubjectOpen(false); subjectForm.resetFields(); toast.success('Subject created') },
    onError: error => toast.error(formatApiError(error)),
  })
  const assignmentMutation = useMutation({
    mutationFn: (values: AssignmentFields) => createTeachingAssignment(accessToken!, values),
    onSuccess: async () => { await invalidate(); setAssignmentOpen(false); assignmentForm.resetFields(); toast.success('Teacher assigned to subject') },
    onError: error => toast.error(formatApiError(error)),
  })
  const classTeacherMutation = useMutation({
    mutationFn: (values: ClassTeacherFields) => setClassTeacher(accessToken!, values.class_group_id, values.teacher_membership_id),
    onSuccess: async () => { await invalidate(); setClassTeacherOpen(false); classTeacherForm.resetFields(); toast.success('Class teacher assigned') },
    onError: error => toast.error(formatApiError(error)),
  })
  const removeClassTeacher = useMutation({
    mutationFn: (classGroupId: string) => setClassTeacher(accessToken!, classGroupId, null),
    onSuccess: async () => { await invalidate(); toast.success('Class teacher removed') },
    onError: error => toast.error(formatApiError(error)),
  })
  const openClassTeacherModal = (classGroupId?: string) => {
    classTeacherForm.resetFields()
    if (classGroupId) classTeacherForm.setFieldsValue({ class_group_id: classGroupId })
    setClassTeacherOpen(true)
  }
  const inviteMutation = useMutation({
    mutationFn: (values: InviteFields) => inviteTeacher(accessToken!, values),
    onSuccess: async result => {
      await invalidate()
      setCreatedInviteUrl(result.email)
      inviteForm.resetFields()
      toast.success('Invitation email queued')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const directMutation = useMutation({
    mutationFn: (values: DirectFields) => createTeacherAccount(accessToken!, values),
    onSuccess: async () => {
      await invalidate()
      await queryClient.invalidateQueries({ queryKey: ['admin-teachers', user?.school_id] })
      setDirectOpen(false)
      directForm.resetFields()
      toast.success('Teacher account created')
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const assignmentColumns: TableColumnsType<TeachingAssignment> = [
    { title: 'CLASS', dataIndex: 'class_name', key: 'class' },
    { title: 'SUBJECT', dataIndex: 'subject_name', key: 'subject', render: (name: string, row) => <span>{name} <Tag>{row.subject_code}</Tag></span> },
    { title: 'TEACHER', dataIndex: 'teacher_name', key: 'teacher', render: (name: string, row) => person(name, row.teacher_email) },
  ]
  const classTeacherColumns: TableColumnsType<ClassGroup> = [
    { title: 'CLASS', dataIndex: 'name', key: 'class', render: (name: string, row) => <span>{name}{row.stream ? <> <Tag>{row.stream}</Tag></> : null}</span> },
    { title: 'GRADE', dataIndex: 'grade_level', key: 'grade' },
    {
      title: 'CLASS TEACHER', key: 'teacher',
      render: (_: unknown, row: ClassGroup) => row.class_teacher_name
        ? person(row.class_teacher_name, 'Form teacher for this class')
        : <span className="teaching-empty">No class teacher yet</span>,
    },
    {
      title: '', key: 'actions', width: 205,
      render: (_: unknown, row: ClassGroup) => canManage ? <span className="teaching-row-actions">
        <Button size="small" onClick={() => openClassTeacherModal(row.id)}>{row.class_teacher_membership_id ? 'Change' : 'Assign'}</Button>
        {row.class_teacher_membership_id && <Popconfirm title="Remove this class teacher?" okText="Remove" cancelText="Keep" onConfirm={() => removeClassTeacher.mutate(row.id)}>
          <Button size="small" danger loading={removeClassTeacher.isPending}>Remove</Button>
        </Popconfirm>}
      </span> : null,
    },
  ]
  const teacherColumns: TableColumnsType<Teacher> = [
    { title: 'TEACHER', key: 'teacher', render: (_: unknown, row: Teacher) => person(row.display_name, row.email) },
    {
      title: 'CLASS TEACHER', key: 'owns',
      render: (_: unknown, row: Teacher) => row.class_teacher_of
        ? <Tag color="blue">{row.class_teacher_of}</Tag>
        : <span className="teaching-empty">Subject teacher only</span>,
    },
    { title: 'SUBJECT LOAD', key: 'load', render: (_: unknown, row: Teacher) => <span className="teaching-load">{workload(row)}</span> },
  ]
  const pageError = subjectsQuery.error ?? assignmentsQuery.error ?? teachersQuery.error
  const ownedClasses = classes.filter(group => group.class_teacher_name).length

  return <section className="academic-section panel teaching-panel">
    {contextHolder}
    <div className="academic-card-heading"><div><span className="academic-card-icon"><TeamOutlined /></span><div><h2>Subjects &amp; teaching assignments</h2><p>Assign class teachers, connect subjects to teachers, and review every teacher's load.</p></div></div>
      <div className="teaching-actions">
        {canInvite && <Dropdown menu={{ items: [
          { key: 'invite', label: 'Invite by email', icon: <MailOutlined /> },
          { key: 'create', label: 'Create account with password', icon: <UsergroupAddOutlined /> },
        ], onClick: ({ key }) => { setCreatedInviteUrl(''); if (key === 'invite') setInviteOpen(true); else setDirectOpen(true) } }}>
          <Button size="small">Invite teacher <DownOutlined /></Button>
        </Dropdown>}
        {canManage && <Button size="small" onClick={() => setSubjectOpen(true)}>Add subject</Button>}
        {canManage && <Button size="small" icon={<IdcardOutlined />} onClick={() => openClassTeacherModal()} disabled={!classes.length || !teachersQuery.data?.length}>Assign class teacher</Button>}
        {canManage && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setAssignmentOpen(true)} disabled={!classes.length || !subjectsQuery.data?.length || !teachersQuery.data?.length}>Assign subject teacher</Button>}
      </div>
    </div>
    {pageError && <Alert type="error" showIcon message="Could not load teaching assignments" description={formatApiError(pageError)} className="student-error"/>}
    <Tabs defaultActiveKey="class-teachers" items={[
      {
        key: 'class-teachers',
        label: `Class teachers (${ownedClasses}/${classes.length})`,
        children: classes.length
          ? <Table<ClassGroup> rowKey="id" columns={classTeacherColumns} dataSource={classes} pagination={false} size="middle" scroll={{ x: 560 }} />
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Create a class first to assign its class teacher" />,
      },
      {
        key: 'subject-assignments',
        label: `Subject assignments (${assignmentsQuery.data?.length ?? 0})`,
        children: assignmentsQuery.data?.length
          ? <Table<TeachingAssignment> rowKey="id" columns={assignmentColumns} dataSource={assignmentsQuery.data} loading={assignmentsQuery.isLoading} pagination={{ pageSize: 6, showSizeChanger: false }} />
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={assignmentsQuery.isLoading ? 'Loading assignments…' : 'No subject teachers assigned for this year yet'} />,
      },
      {
        key: 'teachers',
        label: `Teachers (${teachersQuery.data?.length ?? 0})`,
        children: teachersQuery.data?.length
          ? <Table<Teacher> rowKey="membership_id" columns={teacherColumns} dataSource={teachersQuery.data} loading={teachersQuery.isLoading} pagination={{ pageSize: 6, showSizeChanger: false }} />
          : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={teachersQuery.isLoading ? 'Loading teachers…' : 'No teachers yet — invite or create one above'} />,
      },
    ]} />

    <Modal title="Assign a class teacher" open={classTeacherOpen} onCancel={() => setClassTeacherOpen(false)} footer={null} destroyOnClose>
      <Form form={classTeacherForm} layout="vertical" onFinish={values => classTeacherMutation.mutate(values)}>
        <p className="form-hint">A class teacher belongs to <strong>one</strong> class as its form teacher. They can still be a subject teacher in as many classes as you like.</p>
        <Form.Item name="class_group_id" label="Class" rules={[{ required: true, message: 'Choose a class' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Choose a class"
            options={classes.map(group => ({
              value: group.id,
              label: group.class_teacher_name ? `${group.name} · current: ${group.class_teacher_name}` : `${group.name} · no class teacher`,
            }))}/>
        </Form.Item>
        <Form.Item name="teacher_membership_id" label="Teacher" rules={[{ required: true, message: 'Choose a teacher' }]}>
          <Select showSearch optionFilterProp="label" placeholder="Choose a teacher"
            options={(teachersQuery.data ?? []).map(teacher => ({
              value: teacher.membership_id,
              label: teacher.class_teacher_of
                ? `${teacher.display_name} · class teacher of ${teacher.class_teacher_of}`
                : `${teacher.display_name} · ${teacher.email}`,
            }))}/>
        </Form.Item>
        <div className="student-form-actions"><Button onClick={() => setClassTeacherOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={classTeacherMutation.isPending}>Save assignment</Button></div>
      </Form>
    </Modal>
    <Modal title="Invite a teacher" open={inviteOpen} onCancel={() => { setInviteOpen(false); setCreatedInviteUrl('') }} footer={null} destroyOnClose>
      {createdInviteUrl ? <div className="invite-success"><Alert type="success" showIcon message="Invitation email queued" description={`A one-time invitation link has been emailed to ${createdInviteUrl}. It expires in seven days.`}/></div>
        : <Form form={inviteForm} layout="vertical" onFinish={values => inviteMutation.mutate(values)}>
          <p className="form-hint">The teacher will join this school with a teacher account and can set a password if they are new to Acadex.</p>
          <Form.Item name="display_name" label="Teacher name" rules={[{ required: true, min: 2 }]}><Input maxLength={160} placeholder="Full name"/></Form.Item>
          <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input type="email" maxLength={254} placeholder="teacher@school.edu.gh"/></Form.Item>
          <div className="student-form-actions"><Button onClick={() => setInviteOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>Create invitation</Button></div>
        </Form>}
    </Modal>
    <Modal title="Create a teacher account" open={directOpen} onCancel={() => setDirectOpen(false)} footer={null} destroyOnClose>
      <Form form={directForm} layout="vertical" onFinish={values => directMutation.mutate(values)}>
        <p className="form-hint">The teacher can sign in immediately with the password you set here, and change it later.</p>
        <Form.Item name="display_name" label="Teacher name" rules={[{ required: true, min: 2 }]}><Input maxLength={160} placeholder="Full name"/></Form.Item>
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input type="email" maxLength={254} placeholder="teacher@school.edu.gh"/></Form.Item>
        <Form.Item name="password" label="Temporary password" rules={[{ required: true, min: 12, message: 'Use at least 12 characters' }]}><Input.Password maxLength={128} placeholder="At least 12 characters"/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setDirectOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={directMutation.isPending}>Create account</Button></div>
      </Form>
    </Modal>
    <Modal title="Add a subject" open={subjectOpen} onCancel={() => setSubjectOpen(false)} footer={null} destroyOnClose>
      <Form form={subjectForm} layout="vertical" onFinish={values => subjectMutation.mutate(values)}>
        <Form.Item name="name" label="Subject name" rules={[{ required: true, min: 2 }]}><Input maxLength={100} placeholder="Integrated Science"/></Form.Item>
        <Form.Item name="code" label="Subject code" rules={[{ required: true, min: 2 }]}><Input maxLength={24} placeholder="SCI"/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setSubjectOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={subjectMutation.isPending}>Add subject</Button></div>
      </Form>
    </Modal>
    <Modal title="Assign a subject teacher" open={assignmentOpen} onCancel={() => setAssignmentOpen(false)} footer={null} destroyOnClose>
      <Form form={assignmentForm} layout="vertical" onFinish={values => assignmentMutation.mutate(values)}>
        <p className="form-hint">A subject teacher can teach the same subject in as many classes as you assign.</p>
        <Form.Item name="class_group_id" label="Class group" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={classes.map(group => ({ value: group.id, label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}` }))}/></Form.Item>
        <Form.Item name="subject_id" label="Subject" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(subjectsQuery.data ?? []).map(subject => ({ value: subject.id, label: `${subject.name} · ${subject.code}` }))}/></Form.Item>
        <Form.Item name="teacher_membership_id" label="Teacher" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={(teachersQuery.data ?? []).map(teacher => ({ value: teacher.membership_id, label: teacher.class_teacher_of ? `${teacher.display_name} · class teacher of ${teacher.class_teacher_of}` : `${teacher.display_name} · ${teacher.email}` }))}/></Form.Item>
        <div className="student-form-actions"><Button onClick={() => setAssignmentOpen(false)}>Cancel</Button><Button type="primary" htmlType="submit" loading={assignmentMutation.isPending}>Save assignment</Button></div>
      </Form>
    </Modal>
  </section>
}
