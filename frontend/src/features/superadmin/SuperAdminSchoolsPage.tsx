import { useState } from 'react'
import { Alert, Button, Input, message, Popconfirm, Segmented, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { formatApiError } from '../../shared/api/errors'
import { useSuperAdmin } from './SuperAdminAuth'
import { fetchPlatformSchools, setPlatformSchoolStatus, type PlatformSchool } from './superadminApi'

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
      ? <div className="sa-school-cell"><span>{school.admin_name}</span><small>{school.admin_email}</small></div>
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
    render: (_, school) => <Tag color={school.status === 'active' ? 'green' : 'red'}>
      {school.status === 'active' ? 'Active' : 'Paused'}
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
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [page, setPage] = useState(1)

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
  const schoolColumns: ColumnsType<PlatformSchool> = admin?.role === 'superadmin' ? [
    ...columns,
    {
      title: 'Access', key: 'access', width: 140, fixed: 'right',
      render: (_, school) => <Popconfirm
        title={`${school.status === 'active' ? 'Deactivate' : 'Activate'} ${school.name}?`}
        description={school.status === 'active' ? 'School members will no longer be able to sign in.' : 'School members will be able to sign in again.'}
        okText={school.status === 'active' ? 'Deactivate' : 'Activate'}
        okButtonProps={{ danger: school.status === 'active', loading: statusMutation.isPending }}
        onConfirm={() => statusMutation.mutate({ school, status: school.status === 'active' ? 'inactive' : 'active' })}
      ><Button size="small" danger={school.status === 'active'} disabled={statusMutation.isPending}>
        {school.status === 'active' ? 'Deactivate' : 'Activate'}
      </Button></Popconfirm>,
    },
  ] : columns

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
        scroll={{ x: 1100 }}
        locale={{ emptyText: search || status !== 'all' ? 'No schools match these filters.' : 'No schools yet.' }}
        pagination={{
          current: page, pageSize: PAGE_SIZE, total,
          showSizeChanger: false, onChange: setPage,
          showTotal: () => `${first}–${last} of ${total} schools`,
        }}
      />
    </section>
  </div>
}
