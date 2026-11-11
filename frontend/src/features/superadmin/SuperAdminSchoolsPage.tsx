import { useState } from 'react'
import { Alert, Avatar, Button, Drawer, Empty, Form, Input, message, Modal, Popconfirm, Segmented, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { formatApiError } from '../../shared/api/errors'
import { useSuperAdmin } from './SuperAdminAuth'
import { createPlatformSchool, deletePlatformSchool, fetchPlatformSchoolTeam, fetchPlatformSchools, setPlatformSchoolStatus, updateSchoolAdminInvitation, type PlatformSchool, type PlatformSchoolTeam } from './superadminApi'

const PAGE_SIZE = 20

function trialLabel(school: PlatformSchool) {
  if (!school.trial_ends_at) return <span className="sa-muted">—</span>
  const end = dayjs(school.trial_ends_at)
  const days = end.startOf('day').diff(dayjs().startOf('day'), 'day')
  if (days < 0) return <span className="sa-muted">Trial ended {end.format('DD MMM')}</span>
  return <span className={days <= 7 ? 'sa-trial-warning' : 'sa-muted'}>
    {days === 0 ? 'Ends today' : `${days} day${days === 1 ? '' : 's'} left`}
  </span>
}

const columns: ColumnsType<PlatformSchool> = [
  {
    title: 'School', key: 'school', width: 240,
    render: (_, school) => <div className="sa-school-cell"><strong>{school.name}</strong><span>{school.slug}</span></div>,
  },
  {
    title: 'Administrator', key: 'admin', width: 230,
    render: (_, school) => school.admin_name
      ? <div className="sa-school-cell"><span>{school.admin_name}</span><small>{school.admin_email}</small>{school.admin_invitation_pending && <Tag color="blue">Invitation sent</Tag>}</div>
      : <span className="sa-muted">Not assigned</span>,
  },
  { title: 'Students', dataIndex: 'student_count', key: 'students', align: 'right', width: 100 },
  {
    title: 'Plan', key: 'plan', width: 180,
    render: (_, school) => school.subscription_status === 'active'
      ? <Tag color="blue">Active · {school.student_limit.toLocaleString()} seats</Tag>
      : <Tag>Not subscribed</Tag>,
  },
  { title: 'Trial', key: 'trial', width: 130, render: (_, school) => trialLabel(school) },
  {
    title: 'Status', key: 'status', width: 110,
    render: (_, school) => <Tag color={school.status === 'active' ? 'green' : school.status === 'deleted' ? 'default' : 'red'}>
      {school.status === 'active' ? 'Active' : school.status === 'deleted' ? 'Deleted' : 'Paused'}
    </Tag>,
  },
  {
    title: 'Joined', dataIndex: 'created_at', key: 'created', width: 130,
    render: value => <span className="sa-muted">{dayjs(value).format('DD MMM YYYY')}</span>,
  },
]

export default function SuperAdminSchoolsPage() {
  const { token, admin } = useSuperAdmin()
  const client = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'inactive' | 'deleted'>('all')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedSchool, setSelectedSchool] = useState<PlatformSchool | null>(null)
  const [inviteEdit, setInviteEdit] = useState<{ schoolId: string; display_name: string; email: string } | null>(null)
  const [createForm] = Form.useForm<{ name: string; slug: string; admin_name: string; admin_email: string; logo_url?: string }>()
  const [inviteForm] = Form.useForm<{ display_name: string; email: string }>()

  const schools = useQuery({
    queryKey: ['platform-schools', { search, status, page }],
    queryFn: () => fetchPlatformSchools(token!, {
      search, status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
    }),
    enabled: Boolean(token),
  })
  const statusMutation = useMutation({
    mutationFn: ({ school, status }: { school: PlatformSchool; status: 'active' | 'inactive' }) =>
      setPlatformSchoolStatus(token!, school.id, status),
    onSuccess: async (_result, { school, status: nextStatus }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform-schools'] }),
        client.invalidateQueries({ queryKey: ['platform-overview'] }),
      ])
      toast.success(`${school.name} ${nextStatus === 'active' ? 'activated' : 'deactivated'}`)
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const deleteMutation = useMutation({
    mutationFn: (school: PlatformSchool) => deletePlatformSchool(token!, school.id),
    onSuccess: async (_result, school) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform-schools'] }),
        client.invalidateQueries({ queryKey: ['platform-overview'] }),
      ])
      toast.success(`${school.name} was removed from active schools`)
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const invitationMutation = useMutation({
    mutationFn: (values: { display_name: string; email: string }) => updateSchoolAdminInvitation(token!, inviteEdit!.schoolId, values),
    onSuccess: async invitation => {
      setInviteEdit(null)
      inviteForm.resetFields()
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform-school-team', selectedSchool?.id] }),
        client.invalidateQueries({ queryKey: ['platform-schools'] }),
      ])
      toast.success(`Updated invitation sent to ${invitation.email}`)
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const createMutation = useMutation({
    mutationFn: (values: { name: string; slug: string; admin_name: string; admin_email: string; logo_url?: string }) =>
      createPlatformSchool(token!, { ...values, name: values.name.trim(), slug: values.slug.trim().toLowerCase(), admin_name: values.admin_name.trim(), admin_email: values.admin_email.trim().toLowerCase(), logo_url: values.logo_url?.trim() || undefined }),
    onSuccess: async school => {
      setCreateOpen(false)
      createForm.resetFields()
      setSearch('')
      setSearchInput('')
      setStatus('all')
      setPage(1)
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform-schools'] }),
        client.invalidateQueries({ queryKey: ['platform-overview'] }),
      ])
      toast.success(`School created. An invitation was queued for ${school.admin_email}.`)
    },
    onError: error => toast.error(formatApiError(error)),
  })
  const team = useQuery({
    queryKey: ['platform-school-team', selectedSchool?.id],
    queryFn: () => fetchPlatformSchoolTeam(token!, selectedSchool!.id),
    enabled: Boolean(token && selectedSchool),
  })
  const schoolColumns: ColumnsType<PlatformSchool> = [
    ...columns,
    {
      title: 'Team', key: 'team', width: 140,
      render: (_, school) => <Button type="link" icon={<TeamOutlined/>} onClick={() => setSelectedSchool(school)}>
        {school.admin_count} admins · {school.teacher_count} teachers
      </Button>,
    },
    ...(admin?.role === 'superadmin' ? [
    {
      title: 'Access', key: 'access', width: 230, fixed: 'right' as const,
      render: (_: unknown, school: PlatformSchool) => <div style={{ display: 'flex', gap: 8 }}>
        {school.status !== 'deleted' && <Popconfirm
        title={`${school.status === 'active' ? 'Deactivate' : 'Activate'} ${school.name}?`}
        description={school.status === 'active' ? 'School members will no longer be able to sign in.' : 'School members will be able to sign in again.'}
        okText={school.status === 'active' ? 'Deactivate' : 'Activate'}
        okButtonProps={{ danger: school.status === 'active', loading: statusMutation.isPending }}
        onConfirm={() => statusMutation.mutate({ school, status: school.status === 'active' ? 'inactive' : 'active' })}
      ><Button size="small" danger={school.status === 'active'} disabled={statusMutation.isPending}>
        {school.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button></Popconfirm>}
        {school.status !== 'deleted' && <Popconfirm
          title={`Delete ${school.name}?`}
          description="School access will be disabled and it will be hidden from the landing page. Historical records are retained."
          okText="Delete school" cancelText="Cancel"
          okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
          onConfirm={() => deleteMutation.mutate(school)}
        ><Button size="small" danger disabled={deleteMutation.isPending}>Delete</Button></Popconfirm>}
      </div>,
    },
    ] : []),
  ]

  const total = schools.data?.total ?? 0
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)

  return <div className="sa-page">{contextHolder}
    <div className="sa-page-heading">
      <div>
        <span className="sa-eyebrow">SCHOOL DIRECTORY</span>
        <h2>Schools on Acadex</h2>
        <p>Search a workspace, check its administrator, and see how it is licensed.</p>
      </div>
      {admin?.role === 'superadmin' && <Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateOpen(true)}>Create school</Button>}
    </div>

    <section className="sa-card sa-schools-card">
      <div className="sa-toolbar">
        <Input
          value={searchInput}
          allowClear
          prefix={<SearchOutlined/>}
          placeholder="Search by school name or address"
          aria-label="Search schools"
          onChange={event => {
            setSearchInput(event.target.value)
            if (!event.target.value) { setSearch(''); setPage(1) }
          }}
          onPressEnter={() => { setSearch(searchInput.trim()); setPage(1) }}
        />
        <Segmented
          value={status}
          onChange={value => { setStatus(value as typeof status); setPage(1) }}
          options={[
            { label: 'All', value: 'all' },
            { label: 'Active', value: 'active' },
            { label: 'Paused', value: 'inactive' },
            { label: 'Deleted', value: 'deleted' },
          ]}
        />
        <Button icon={<ReloadOutlined/>} onClick={() => { void schools.refetch() }} loading={schools.isFetching}>
          Refresh
        </Button>
      </div>

      {schools.isError && <Alert
        type="error" showIcon className="sa-table-alert"
        message="Schools could not load" description={formatApiError(schools.error)}
      />}

      <Table<PlatformSchool>
        rowKey="id"
        size="middle"
        loading={schools.isLoading}
        columns={schoolColumns}
        dataSource={schools.data?.items ?? []}
        scroll={{ x: 1200 }}
        locale={{ emptyText: search || status !== 'all' ? 'No schools match these filters.' : 'No schools yet.' }}
        pagination={{
          current: page, pageSize: PAGE_SIZE, total,
          showSizeChanger: false, onChange: setPage,
          showTotal: () => `${first}–${last} of ${total} schools`,
        }}
      />
    </section>
    <Modal
      title="Create a school workspace"
      open={createOpen}
      onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
      onOk={() => createForm.submit()}
      okText="Create school"
      confirmLoading={createMutation.isPending}
      destroyOnHidden
      className="sa-modal"
    >
      <p className="sa-modal-intro">Add the school and invite its first administrator to set a password.</p>
      <Form form={createForm} layout="vertical" requiredMark="optional" onFinish={values => createMutation.mutate(values)}>
        <Form.Item name="name" label="School name" rules={[{ required: true, min: 2, max: 160 }]}><Input placeholder="e.g. Aburi Academy"/></Form.Item>
        <Form.Item name="slug" label="School address" rules={[{ required: true, min: 3, max: 80 }, { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers, and single hyphens.' }]}><Input addonBefore="acadex.app/" placeholder="aburi-academy"/></Form.Item>
        <div className="sa-modal-subhead">First administrator</div>
        <Form.Item name="admin_name" label="Full name" rules={[{ required: true, min: 2, max: 160 }]}><Input placeholder="Administrator name"/></Form.Item>
        <Form.Item name="admin_email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input placeholder="admin@school.edu.gh"/></Form.Item>
        <Form.Item name="logo_url" label="School logo URL" rules={[{ validator: (_, value) => {
          if (!value) return Promise.resolve()
          try { return new URL(value).protocol === 'https:' ? Promise.resolve() : Promise.reject(new Error('Use a secure https:// link.')) }
          catch { return Promise.reject(new Error('Enter a valid logo URL.')) }
        } }]}><Input placeholder="https://example.com/logo.png"/></Form.Item>
        <div className="sa-form-hint">Logo URL is optional and must use HTTPS. The administrator receives a secure, one-time invitation to finish setup.</div>
      </Form>
    </Modal>
    <Modal
      title="Correct administrator invitation"
      open={Boolean(inviteEdit)}
      onCancel={() => { setInviteEdit(null); inviteForm.resetFields() }}
      onOk={() => inviteForm.submit()}
      okText="Save and resend"
      confirmLoading={invitationMutation.isPending}
      destroyOnHidden
      className="sa-modal"
    >
      <p className="sa-modal-intro">Update the recipient details. A fresh, seven-day invitation link will be sent to the corrected email address.</p>
      <Form form={inviteForm} layout="vertical" requiredMark="optional" onFinish={values => invitationMutation.mutate({ display_name: values.display_name.trim(), email: values.email.trim().toLowerCase() })}>
        <Form.Item name="display_name" label="Full name" rules={[{ required: true, min: 2, max: 160 }]}><Input autoComplete="name"/></Form.Item>
        <Form.Item name="email" label="Email address" rules={[{ required: true, type: 'email' }]}><Input autoComplete="email"/></Form.Item>
      </Form>
    </Modal>
    <Drawer
      title={selectedSchool ? <span className="sa-drawer-title"><Avatar shape="square" src={selectedSchool.logo_url}>{selectedSchool.name.slice(0, 1)}</Avatar><span><strong>{selectedSchool.name}</strong><small>School team</small></span></span> : 'School team'}
      open={Boolean(selectedSchool)}
      onClose={() => setSelectedSchool(null)}
      width={620}
      destroyOnHidden
    >
      {team.isError && <Alert type="error" showIcon message="Could not load this school’s team" description={formatApiError(team.error)}/>}
      {team.isLoading ? <div className="sa-team-loading">Loading administrators and teachers…</div> : team.data && <SchoolTeamPanel team={team.data} canManage={admin?.role === 'superadmin'} onEditInvitation={invitation => {
        setInviteEdit({ schoolId: team.data!.school_id, ...invitation })
        inviteForm.setFieldsValue(invitation)
      }} />}
    </Drawer>
  </div>
}

function SchoolTeamPanel({ team, canManage, onEditInvitation }: { team: PlatformSchoolTeam; canManage: boolean; onEditInvitation: (invitation: PlatformSchoolTeam['pending_admin_invitations'][number]) => void }) {
  const memberColumns: ColumnsType<PlatformSchoolTeam['administrators'][number]> = [
    { title: 'Name', dataIndex: 'display_name', render: (name: string, member) => <div className="sa-member-cell"><Avatar size={30}>{name.trim().slice(0, 1).toUpperCase()}</Avatar><div><strong>{name}</strong><small>{member.email}</small></div></div> },
    { title: 'Status', dataIndex: 'status', width: 100, render: (value: string) => <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag> },
    { title: 'Joined', dataIndex: 'joined_at', width: 110, render: (value: string) => <span className="sa-muted">{dayjs(value).format('DD MMM YYYY')}</span> },
  ]
  return <div className="sa-team-panel">
    <section><header><div><h3>Administrators</h3><p>People with school-wide administration access</p></div><Tag>{team.administrators.length}</Tag></header>
      {team.administrators.length ? <Table rowKey="membership_id" size="small" columns={memberColumns} dataSource={team.administrators} pagination={false}/> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No school administrators yet"/>}
    </section>
    <section><header><div><h3>Teachers</h3><p>Teachers attached to this school workspace</p></div><Tag>{team.teachers.length}</Tag></header>
      {team.teachers.length ? <Table rowKey="membership_id" size="small" columns={memberColumns} dataSource={team.teachers} pagination={{ pageSize: 8, size: 'small' }}/> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No teachers yet"/>}
    </section>
    {team.pending_admin_invitations.length > 0 && <section><header><div><h3>Administrator invitations</h3><p>Invitations waiting to be accepted</p></div><Tag color="blue">{team.pending_admin_invitations.length} pending</Tag></header>
      <div className="sa-invitation-list">{team.pending_admin_invitations.map(invitation => <div key={invitation.email}><Avatar size={30}>{invitation.display_name.trim().slice(0, 1).toUpperCase()}</Avatar><span><strong>{invitation.display_name}</strong><small>{invitation.email} · expires {dayjs(invitation.expires_at).format('DD MMM')}</small></span>{canManage && <Button size="small" onClick={() => onEditInvitation(invitation)}>Edit &amp; resend</Button>}</div>)}</div>
    </section>}
  </div>
}
