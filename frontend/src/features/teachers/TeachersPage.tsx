import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Button, Dropdown, Empty, Form, Input, Modal, Select, Skeleton, Table, Tabs, Tag, message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  DownOutlined, IdcardOutlined, PlusOutlined, SolutionOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { fetchClassGroups } from '../academic/academicApi'
import {
  createTeachingAssignment, fetchSubjects, fetchTeachingAssignments, inviteTeacher, setClassTeacher,
} from '../academic/teachingApi'
import { createTeacherAccount, fetchAdminTeachers } from '../academic/staffAdminApi'
import type { AdminTeacher, TeachingAssignment } from '../../shared/api/types'

type TeacherForm = { display_name: string; email: string; password: string }
type InviteForm = { display_name: string; email: string }
type SubjectForm = { class_group_id: string; subject_id: string }
type ClassTeacherForm = { class_group_id: string }

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

export default function TeachersPage() {
  const { accessToken, user } = useAuth()
  const { yearId } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [addOpen, setAddOpen] = useState(false)
  const [subjectTarget, setSubjectTarget] = useState<AdminTeacher | null>(null)
  const [classTeacherTarget, setClassTeacherTarget] = useState<AdminTeacher | null>(null)
  const [inviteSentTo, setInviteSentTo] = useState('')
  const [teacherForm] = Form.useForm<TeacherForm>()
  const [inviteForm] = Form.useForm<InviteForm>()
  const [subjectForm] = Form.useForm<SubjectForm>()
  const [classTeacherForm] = Form.useForm<ClassTeacherForm>()

  const role = user?.role ?? ''
  const canManage = ['school_admin', 'principal', 'registrar'].includes(role)
  const canCreate = role === 'school_admin'
  const canAssign = ['school_admin', 'registrar'].includes(role)

  const teachersQuery = useQuery({
    queryKey: ['admin-teachers', user?.school_id],
    queryFn: () => fetchAdminTeachers(accessToken!),
    enabled: Boolean(accessToken) && canManage,
  })
  const classesQuery = useQuery({
    queryKey: ['class-groups', user?.school_id, yearId],
    queryFn: () => fetchClassGroups(accessToken!, yearId),
    enabled: Boolean(accessToken) && Boolean(yearId) && canManage,
  })
  const subjectsQuery = useQuery({
    queryKey: ['subjects', user?.school_id],
    queryFn: () => fetchSubjects(accessToken!),
    enabled: Boolean(accessToken) && canManage,
  })
  const assignmentsQuery = useQuery({
    queryKey: ['teaching-assignments', user?.school_id, yearId],
    queryFn: () => fetchTeachingAssignments(accessToken!, yearId),
    enabled: Boolean(accessToken) && Boolean(yearId) && canManage,
  })

  const teachers = teachersQuery.data ?? []
  const classes = classesQuery.data ?? []
  const subjects = subjectsQuery.data ?? []
  const assignments = assignmentsQuery.data ?? []

  const classTeacherOf = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const group of classes) {
      if (!group.class_teacher_membership_id) continue
      const list = map.get(group.class_teacher_membership_id) ?? []
      list.push(group.name + (group.stream ? ` ${group.stream}` : ''))
      map.set(group.class_teacher_membership_id, list)
    }
    return map
  }, [classes])

  const assignmentsByTeacher = useMemo(() => {
    const map = new Map<string, TeachingAssignment[]>()
    for (const assignment of assignments) {
      const list = map.get(assignment.teacher_membership_id) ?? []
      list.push(assignment)
      map.set(assignment.teacher_membership_id, list)
    }
    return map
  }, [assignments])

  const unassignedClasses = classes.filter(group => !group.class_teacher_membership_id)
  const assignedClasses = classes.length - unassignedClasses.length

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-teachers', user?.school_id] }),
      queryClient.invalidateQueries({ queryKey: ['teachers', user?.school_id] }),
      queryClient.invalidateQueries({ queryKey: ['class-groups', user?.school_id] }),
      queryClient.invalidateQueries({ queryKey: ['teaching-assignments', user?.school_id] }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: (values: TeacherForm) => createTeacherAccount(accessToken!, values),
    onSuccess: async () => {
      await refresh()
      toast.success('Teacher account created')
      setAddOpen(false)
      teacherForm.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const inviteMutation = useMutation({
    mutationFn: (values: InviteForm) => inviteTeacher(accessToken!, values),
    onSuccess: result => {
      setInviteSentTo(result.email)
      toast.success('Invitation email queued')
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const subjectMutation = useMutation({
    mutationFn: (values: SubjectForm) => createTeachingAssignment(accessToken!, {
      class_group_id: values.class_group_id,
      subject_id: values.subject_id,
      teacher_membership_id: subjectTarget!.membership_id,
    }),
    onSuccess: async () => {
      await refresh()
      toast.success('Teacher assigned to the subject')
      setSubjectTarget(null)
      subjectForm.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const classTeacherMutation = useMutation({
    mutationFn: (values: ClassTeacherForm) =>
      setClassTeacher(accessToken!, values.class_group_id, classTeacherTarget!.membership_id),
    onSuccess: async () => {
      await refresh()
      toast.success('Class teacher assigned')
      setClassTeacherTarget(null)
      classTeacherForm.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const removeClassTeacher = useMutation({
    mutationFn: (classGroupId: string) => setClassTeacher(accessToken!, classGroupId, null),
    onSuccess: async () => {
      await refresh()
      toast.success('Class teacher cleared')
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const openSubject = (teacher: AdminTeacher) => {
    subjectForm.resetFields()
    setSubjectTarget(teacher)
  }
  const openClassTeacher = (teacher: AdminTeacher) => {
    classTeacherForm.resetFields()
    setClassTeacherTarget(teacher)
  }
  const columns: TableColumnsType<AdminTeacher> = [
    {
      title: 'TEACHER',
      key: 'teacher',
      render: (_, row) => (
        <div className="teacher-cell">
          <span className="teacher-avatar">{initials(row.display_name)}</span>
          <span className="teacher-meta">
            <strong>{row.display_name}</strong>
            <small>{row.email}</small>
          </span>
        </div>
      ),
    },
    {
      title: 'CLASS TEACHER OF',
      key: 'classTeacher',
      render: (_, row) => {
        const names = classTeacherOf.get(row.membership_id) ?? []
        if (!names.length) return <span className="table-muted">Not assigned</span>
        return (
          <span className="teacher-tags">
            {names.map(name => <Tag color="blue" key={name}>{name}</Tag>)}
          </span>
        )
      },
    },
    {
      title: 'SUBJECTS',
      key: 'subjects',
      render: (_, row) => {
        const rows = assignmentsByTeacher.get(row.membership_id) ?? []
        if (!rows.length) return <span className="table-muted">No subjects yet</span>
        return (
          <span className="teacher-tags">
            {rows.slice(0, 2).map(item => (
              <Tag key={item.id}>{item.class_name} · {item.subject_code}</Tag>
            ))}
            {rows.length > 2 && <Tag>+{rows.length - 2}</Tag>}
          </span>
        )
      },
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      align: 'right',
      render: (_, row) => {
        const classNames = classTeacherOf.get(row.membership_id) ?? []
        const items = [
          {
            key: 'subject',
            label: 'Assign to a subject',
            disabled: !canAssign || !yearId || subjects.length === 0,
            onClick: () => openSubject(row),
          },
          {
            key: 'classTeacher',
            label: 'Make a class teacher',
            disabled: !canAssign || !yearId || classes.length === 0,
            onClick: () => openClassTeacher(row),
          },
          ...(classNames.length
            ? [{
                key: 'remove',
                label: 'Remove as class teacher',
                danger: true,
                disabled: !canAssign,
                onClick: () => {
                  const group = classes.find(item => item.class_teacher_membership_id === row.membership_id)
                  if (group) removeClassTeacher.mutate(group.id)
                },
              }]
            : []),
        ]
        return (
          <Dropdown menu={{ items }} trigger={['click']}>
            <Button size="small">
              Manage <DownOutlined />
            </Button>
          </Dropdown>
        )
      },
    },
  ]

  if (!canManage) {
    return (
      <div className="page-content">
        <Alert type="info" showIcon message="Teachers are managed by administrators, principals and registrars." />
      </div>
    )
  }

  const availableClasses = classTeacherTarget
    ? classes.filter(group =>
        !group.class_teacher_membership_id
        || group.class_teacher_membership_id === classTeacherTarget.membership_id)
    : classes

  return (
    <div className="page-content teachers-page">
      {contextHolder}
      <div className="eyebrow">PEOPLE</div>
      <div className="students-heading">
        <div>
          <h1>Teachers</h1>
          <p>Invite teaching staff, then assign them to subjects or make them a class teacher.</p>
        </div>
        {canCreate && (
          <Button
            type="primary" icon={<PlusOutlined />}
            onClick={() => { setInviteSentTo(''); teacherForm.resetFields(); inviteForm.resetFields(); setAddOpen(true) }}
          >
            Add teacher
          </Button>
        )}
      </div>

      <div className="stats-grid teachers-stats">
        <div className="stat-card">
          <div className="stat-top"><span>Teachers</span><span className="stat-icon blue"><IdcardOutlined /></span></div>
          <div className="stat-value">{teachers.length}</div>
          <div className="stat-foot">On staff at this school</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Class teachers</span><span className="stat-icon green"><TeamOutlined /></span></div>
          <div className="stat-value">{assignedClasses}<small className="stat-of">/{classes.length}</small></div>
          <div className="stat-foot">{unassignedClasses.length ? `${unassignedClasses.length} class${unassignedClasses.length === 1 ? '' : 'es'} without one` : 'Every class has one'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><span>Subject assignments</span><span className="stat-icon purple"><SolutionOutlined /></span></div>
          <div className="stat-value">{assignments.length}</div>
          <div className="stat-foot">Across {subjects.length} subject{subjects.length === 1 ? '' : 's'} this year</div>
        </div>
      </div>

      {!yearId && (
        <Alert
          type="warning" showIcon className="teacher-alert"
          message="No academic year selected"
          description="Choose an academic year in the top bar to assign teachers to classes."
        />
      )}

      {teachersQuery.error && (
        <Alert
          type="error" showIcon className="teacher-alert" message="Could not load teachers"
          description={formatApiError(teachersQuery.error)}
          action={<Button size="small" onClick={() => void teachersQuery.refetch()}>Retry</Button>}
        />
      )}

      <section className="academic-section panel teacher-panel">
        <div className="academic-card-heading">
          <div>
            <span className="academic-card-icon"><IdcardOutlined /></span>
            <div>
              <h2>Teaching staff</h2>
              <p>Their class, subject load and assignment shortcuts.</p>
            </div>
          </div>
        </div>

        {teachersQuery.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : teachers.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={canCreate
              ? 'No teachers yet. Add the first teacher to get started.'
              : 'No teachers have been added yet.'}
          >
            {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>Add teacher</Button>}
          </Empty>
        ) : (
          <Table<AdminTeacher>
            rowKey="membership_id"
            columns={columns}
            dataSource={teachers}
            pagination={teachers.length > 8 ? { pageSize: 8, showSizeChanger: false } : false}
            scroll={{ x: 760 }}
          />
        )}
      </section>

      {canAssign && yearId && (subjects.length === 0 || classes.length === 0) && (
        <Alert
          type="info" showIcon className="teacher-alert"
          message={classes.length === 0 ? 'No classes for this academic year' : 'No subjects yet'}
          description={classes.length === 0
            ? 'Create a class group under Classes & academics before assigning a class teacher.'
            : 'Create subjects under Classes & academics before assigning a teacher to a subject.'}
        />
      )}

      <Modal
        title="Add a teacher"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        footer={null}
        destroyOnClose
        width={560}
      >
        <Tabs
          items={[
            {
              key: 'account',
              label: 'Create account',
              children: (
                <Form form={teacherForm} layout="vertical" onFinish={values => createMutation.mutate(values)}>
                  <p className="form-hint">
                    The teacher can sign in immediately with this password and change it later.
                  </p>
                  <Form.Item name="display_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter the teacher name' }]}>
                    <Input maxLength={160} placeholder="Kofi Mensah" />
                  </Form.Item>
                  <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address' }]}>
                    <Input type="email" maxLength={254} placeholder="teacher@school.edu.gh" />
                  </Form.Item>
                  <Form.Item name="password" label="Temporary password" rules={[{ required: true, min: 12, message: 'Use at least 12 characters' }]}>
                    <Input.Password maxLength={128} placeholder="At least 12 characters" />
                  </Form.Item>
                  <div className="student-form-actions">
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Create account</Button>
                  </div>
                </Form>
              ),
            },
            {
              key: 'invite',
              label: 'Invite by email',
              children: inviteSentTo ? (
                <div className="invite-success">
                  <Alert
                    type="success" showIcon message="Invitation email queued"
                    description={`A one-time invitation link has been emailed to ${inviteSentTo}. It expires in seven days.`}
                  />
                </div>
              ) : (
                <Form form={inviteForm} layout="vertical" onFinish={values => inviteMutation.mutate(values)}>
                  <p className="form-hint">We’ll email a one-time invitation link. The teacher sets their own password when accepting it.</p>
                  <Form.Item name="display_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter the teacher name' }]}>
                    <Input maxLength={160} placeholder="Kofi Mensah" />
                  </Form.Item>
                  <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address' }]}>
                    <Input type="email" maxLength={254} placeholder="teacher@school.edu.gh" />
                  </Form.Item>
                  <div className="student-form-actions">
                    <Button onClick={() => setAddOpen(false)}>Cancel</Button>
                    <Button type="primary" htmlType="submit" loading={inviteMutation.isPending}>Create invitation</Button>
                  </div>
                </Form>
              ),
            },
          ]}
        />
      </Modal>

      <Modal
        title={subjectTarget ? `Assign ${subjectTarget.display_name} to a subject` : 'Assign to a subject'}
        open={Boolean(subjectTarget)}
        onCancel={() => setSubjectTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form form={subjectForm} layout="vertical" onFinish={values => subjectMutation.mutate(values)}>
          <Form.Item name="class_group_id" label="Class" rules={[{ required: true, message: 'Choose the class' }]}>
            <Select
              placeholder="Choose a class"
              options={classes.map(group => ({ value: group.id, label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}` }))}
            />
          </Form.Item>
          <Form.Item name="subject_id" label="Subject" rules={[{ required: true, message: 'Choose the subject' }]}>
            <Select
              showSearch optionFilterProp="label"
              placeholder={subjects.length ? 'Choose a subject' : 'No subjects yet'}
              disabled={subjects.length === 0}
              options={subjects.map(subject => ({ value: subject.id, label: `${subject.name} (${subject.code})` }))}
            />
          </Form.Item>
          <p className="form-hint">Subject assignments are independent of the class-teacher role.</p>
          <div className="student-form-actions">
            <Button onClick={() => setSubjectTarget(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={subjectMutation.isPending} disabled={subjects.length === 0}>
              Assign subject
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title={classTeacherTarget ? `Make ${classTeacherTarget.display_name} a class teacher` : 'Assign a class teacher'}
        open={Boolean(classTeacherTarget)}
        onCancel={() => setClassTeacherTarget(null)}
        footer={null}
        destroyOnClose
      >
        <Form form={classTeacherForm} layout="vertical" onFinish={values => classTeacherMutation.mutate(values)}>
          <Form.Item name="class_group_id" label="Class" rules={[{ required: true, message: 'Choose the class' }]}>
            <Select
              placeholder={availableClasses.length ? 'Choose a class' : 'Every class already has a class teacher'}
              disabled={availableClasses.length === 0}
              options={availableClasses.map(group => ({
                value: group.id,
                label: `${group.name}${group.stream ? ` · ${group.stream}` : ''}${group.class_teacher_name ? ` — currently ${group.class_teacher_name}` : ''}`,
              }))}
            />
          </Form.Item>
          <p className="form-hint">
            A teacher can be class teacher of one class at a time. Attendance is recorded by the class teacher.
          </p>
          <div className="student-form-actions">
            <Button onClick={() => setClassTeacherTarget(null)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={classTeacherMutation.isPending} disabled={availableClasses.length === 0}>
              Make class teacher
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  )
}
