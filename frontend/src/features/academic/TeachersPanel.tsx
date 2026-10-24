import { useState } from 'react'
import { Alert, Button, Empty, Form, Input, Modal, Table, Tag, message } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusOutlined, UsergroupAddOutlined } from '@ant-design/icons'
import { useAuth } from '../auth/authHooks'
import type { AdminTeacher } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'
import { createTeacherAccount, fetchAdminTeachers } from './staffAdminApi'

type TeacherFields = { display_name: string; email: string; password: string }

export function TeachersPanel() {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [createOpen, setCreateOpen] = useState(false)
  const [form] = Form.useForm<TeacherFields>()
  const canCreate = user?.role === 'school_admin'

  const teachersQuery = useQuery({
    queryKey: ['admin-teachers', user?.school_id],
    queryFn: () => fetchAdminTeachers(accessToken!),
    enabled: !!accessToken && ['school_admin', 'principal', 'registrar'].includes(user?.role ?? ''),
  })

  const createMutation = useMutation({
    mutationFn: (values: TeacherFields) => createTeacherAccount(accessToken!, values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teachers', user?.school_id] })
      await queryClient.invalidateQueries({ queryKey: ['teachers', user?.school_id] })
      toast.success('Teacher account created')
      setCreateOpen(false)
      form.resetFields()
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const columns: TableColumnsType<AdminTeacher> = [
    { title: 'TEACHER', dataIndex: 'display_name', key: 'name', render: (name: string, row) =>
      <div className="academic-person"><strong>{name}</strong><small>{row.email}</small></div> },
    { title: 'CLASSES', dataIndex: 'class_count', key: 'classes', render: (count: number) =>
      count ? <Tag color="blue">{count} {count === 1 ? 'class' : 'classes'}</Tag> : <span className="table-muted">—</span> },
    { title: 'SUBJECTS', dataIndex: 'subject_count', key: 'subjects', render: (count: number) =>
      count ? <Tag>{count} {count === 1 ? 'subject' : 'subjects'}</Tag> : <span className="table-muted">—</span> },
    { title: 'STATUS', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color="green" className="student-status">{value}</Tag> },
  ]

  return <section className="academic-section panel teaching-panel">
    {contextHolder}
    <div className="academic-card-heading">
      <div><span className="academic-card-icon"><UsergroupAddOutlined /></span>
        <div><h2>Teachers</h2><p>Everyone who teaches at this school, with their current load.</p></div></div>
      {canCreate && <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true) }}>Add teacher</Button>}
    </div>
    {teachersQuery.error && <Alert type="error" showIcon message="Could not load teachers" description={formatApiError(teachersQuery.error)} className="student-error" />}
    {teachersQuery.data?.length
      ? <Table<AdminTeacher> rowKey="membership_id" columns={columns} dataSource={teachersQuery.data}
          loading={teachersQuery.isLoading} pagination={{ pageSize: 6, showSizeChanger: false }} />
      : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={teachersQuery.isLoading ? 'Loading teachers…' : 'No teachers yet — invite one or add an account directly'} />}

    <Modal title="Add a teacher account" open={createOpen} onCancel={() => setCreateOpen(false)} footer={null} destroyOnClose>
      <Form form={form} layout="vertical" onFinish={values => createMutation.mutate(values)} className="academic-form">
        <p className="form-hint">The teacher can sign in immediately with the password you set here, and change it later.</p>
        <Form.Item name="display_name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter the teacher name' }]}>
          <Input maxLength={160} placeholder="Kofi Mensah" />
        </Form.Item>
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email', message: 'Enter a valid email address' }]}>
          <Input type="email" maxLength={254} placeholder="teacher@school.edu.gh" />
        </Form.Item>
        <Form.Item name="password" label="Temporary password" rules={[{ required: true, min: 12, message: 'Use at least 12 characters' }]}
          extra="Share it securely; the teacher should change it after signing in.">
          <Input.Password maxLength={128} placeholder="At least 12 characters" />
        </Form.Item>
        <div className="student-form-actions">
          <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={createMutation.isPending}>Create account</Button>
        </div>
      </Form>
    </Modal>
  </section>
}
