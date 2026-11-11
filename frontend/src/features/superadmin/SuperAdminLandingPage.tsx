import { useState } from 'react'
import { Alert, Avatar, Empty, message, Switch, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatApiError } from '../../shared/api/errors'
import { useSuperAdmin } from './SuperAdminAuth'
import { fetchPlatformSchools, setPlatformLandingVisibility, type PlatformSchool } from './superadminApi'

const PAGE_SIZE = 25

export default function SuperAdminLandingPage() {
  const { token, admin } = useSuperAdmin()
  const client = useQueryClient()
  const [toast, contextHolder] = message.useMessage()
  const [page, setPage] = useState(1)
  const schools = useQuery({
    queryKey: ['platform-schools', { landingPage: page }],
    queryFn: () => fetchPlatformSchools(token!, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    enabled: Boolean(token),
  })
  const visibility = useMutation({
    mutationFn: ({ school, show }: { school: PlatformSchool; show: boolean }) =>
      setPlatformLandingVisibility(token!, school.id, show),
    onSuccess: async (_result, { school, show }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['platform-schools'] }),
        client.invalidateQueries({ queryKey: ['public-schools'] }),
      ])
      toast.success(`${school.name} ${show ? 'will appear' : 'was removed'} ${show ? 'on' : 'from'} the landing page`)
    },
    onError: error => toast.error(formatApiError(error)),
  })

  const columns: ColumnsType<PlatformSchool> = [
    {
      title: 'School', key: 'school',
      render: (_, school) => <div className="sa-school-brand-cell"><Avatar shape="square" src={school.logo_url}>{school.name.trim().slice(0, 1).toUpperCase()}</Avatar><div><strong>{school.name}</strong><small>{school.slug}</small></div></div>,
    },
    { title: 'Workspace', key: 'status', width: 140, render: (_, school) => <Tag color={school.status === 'active' ? 'green' : 'default'}>{school.status === 'active' ? 'Active' : 'Paused'}</Tag> },
    {
      title: 'Landing page', key: 'landing', width: 200,
      render: (_, school) => <div className="sa-landing-toggle"><Switch
        checked={school.show_on_landing}
        disabled={admin?.role !== 'superadmin' || school.status !== 'active' || visibility.isPending}
        loading={visibility.isPending && visibility.variables?.school.id === school.id}
        aria-label={`${school.show_on_landing ? 'Remove' : 'Show'} ${school.name} on landing page`}
        onChange={show => visibility.mutate({ school, show })}
      /><span>{school.show_on_landing ? 'Shown publicly' : school.status !== 'active' ? 'Activate to show' : 'Hidden'}</span></div>,
    },
  ]

  return <div className="sa-page">{contextHolder}
    <div className="sa-page-heading">
      <div><span className="sa-eyebrow">PUBLIC SCHOOL PROFILES</span><h2>Landing page visibility</h2><p>Choose which schools may display their name and logo on the Acadex landing page.</p></div>
    </div>
    <Alert className="sa-landing-note" type="info" showIcon message="Only active schools can be displayed." description="Turn on a school to include its name and logo in the public school carousel. Turn it off at any time to remove it."/>
    <section className="sa-card sa-landing-card">
      {schools.isError && <Alert type="error" showIcon className="sa-table-alert" message="Schools could not load" description={formatApiError(schools.error)}/>}
      <Table<PlatformSchool>
        rowKey="id" size="middle" columns={columns} loading={schools.isLoading}
        dataSource={schools.data?.items ?? []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No schools have been registered yet"/> }}
        pagination={{ current: page, pageSize: PAGE_SIZE, total: schools.data?.total ?? 0, showSizeChanger: false, onChange: setPage, showTotal: total => `${total} schools` }}
      />
    </section>
  </div>
}
