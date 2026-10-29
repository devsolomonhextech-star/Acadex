import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircleOutlined, ClockCircleOutlined, InboxOutlined, MailOutlined, MessageOutlined,
  ReloadOutlined, SearchOutlined, SendOutlined, WarningOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Input, Select, Skeleton, Tag, message } from 'antd'
import dayjs from 'dayjs'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import type { ParentRequestDetail, ParentRequestStatus, ParentRequestSummary } from '../../shared/api/types'
import {
  fetchParentRequest, fetchParentRequests, replyToParentRequest, setParentRequestStatus,
} from './parentReportsApi'

const { TextArea } = Input

const STATUS_META: Record<ParentRequestStatus, { label: string; tone: string; icon: ReactNode }> = {
  open: { label: 'Needs reply', tone: 'warn', icon: <WarningOutlined /> },
  awaiting_parent: { label: 'Waiting on parent', tone: 'info', icon: <ClockCircleOutlined /> },
  resolved: { label: 'Resolved', tone: 'ok', icon: <CheckCircleOutlined /> },
}

const TOPIC_LABELS: Record<string, string> = {
  absence: 'Attendance',
  documents: 'Documents',
  meeting: 'Meeting',
  fees: 'Fees',
  details: 'Contact details',
  other: 'General',
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

function timeAgo(value: string) {
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return dayjs(value).format('D MMM')
}

function answeredIn(detail: ParentRequestDetail) {
  if (!detail.first_school_reply_at) return null
  const minutes = Math.max(1, dayjs(detail.first_school_reply_at).diff(dayjs(detail.created_at), 'minute'))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h`
  return `${Math.round(hours / 24)} d`
}

function StatusPill({ status }: { status: ParentRequestStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.open
  return <span className={`comms-pill comms-pill-${meta.tone}`}>{meta.icon}{meta.label}</span>
}

function StatCard({ label, value, hint, tone, icon }: {
  label: string; value: number; hint: string; tone: string; icon: ReactNode
}) {
  return (
    <div className={`comms-stat comms-stat-${tone}`}>
      <span className="comms-stat-icon">{icon}</span>
      <div>
        <span className="comms-stat-label">{label}</span>
        <strong className="comms-stat-value">{value}</strong>
        <small className="comms-stat-hint">{hint}</small>
      </div>
    </div>
  )
}

export default function ParentReportsPage() {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reply, setReply] = useState('')
  const messagesRef = useRef<HTMLDivElement>(null)

  const selectedId = searchParams.get('request')
  const canManage = ['school_admin', 'principal'].includes(user?.role ?? '')

  useEffect(() => {
    const timer = window.setTimeout(() => { setSearch(searchInput); setPage(1) }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  const listQuery = useQuery({
    queryKey: ['parent-requests', status, search, page],
    queryFn: () => fetchParentRequests(accessToken!, { status, search, page }),
    enabled: Boolean(accessToken) && canManage,
    refetchInterval: 60_000,
  })
  const detailQuery = useQuery({
    queryKey: ['parent-request', selectedId],
    queryFn: () => fetchParentRequest(accessToken!, selectedId!),
    enabled: Boolean(accessToken) && Boolean(selectedId) && canManage,
  })

  const counts = listQuery.data?.counts ?? { open: 0, awaiting_parent: 0, resolved: 0, unread: 0, total: 0 }
  const items = listQuery.data?.items ?? []
  const detail = detailQuery.data
  const detailId = detail?.id
  const messageCount = detail?.messages.length ?? 0

  useEffect(() => {
    const node = messagesRef.current
    if (!node) return
    const pin = () => { node.scrollTop = node.scrollHeight }
    pin()
    const frame = window.requestAnimationFrame(pin)
    const timer = window.setTimeout(pin, 160)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [detailId, messageCount])

  // Opening a report clears its unread marker server-side; refresh the badges.
  useEffect(() => {
    if (!detailId) return
    void queryClient.invalidateQueries({ queryKey: ['parent-requests'] })
    void queryClient.invalidateQueries({ queryKey: ['parent-request-counts'] })
    void queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }, [detailId, queryClient])

  const openRequest = (requestId: string) => {
    setReply('')
    setSearchParams({ request: requestId }, { replace: true })
  }
  const closeRequest = () => setSearchParams({}, { replace: true })

  const replyMutation = useMutation({
    mutationFn: () => replyToParentRequest(accessToken!, selectedId!, reply.trim()),
    onSuccess: (updated) => {
      setReply('')
      queryClient.setQueryData(['parent-request', selectedId], updated)
      void queryClient.invalidateQueries({ queryKey: ['parent-requests'] })
      void queryClient.invalidateQueries({ queryKey: ['parent-request-counts'] })
      message.success('Reply sent — the parent has been notified')
    },
    onError: (error) => message.error(formatApiError(error)),
  })

  const statusMutation = useMutation({
    mutationFn: (next: ParentRequestStatus) => setParentRequestStatus(accessToken!, selectedId!, next),
    onSuccess: (updated) => {
      queryClient.setQueryData(['parent-request', selectedId], updated)
      void queryClient.invalidateQueries({ queryKey: ['parent-requests'] })
      message.success(updated.status === 'resolved' ? 'Report marked as resolved' : 'Report reopened')
    },
    onError: (error) => message.error(formatApiError(error)),
  })

  const selectOptions = [
    { value: 'all', label: 'All reports' },
    { value: 'open', label: `Needs reply${counts.open ? ` (${counts.open})` : ''}` },
    { value: 'awaiting_parent', label: `Waiting on parent${counts.awaiting_parent ? ` (${counts.awaiting_parent})` : ''}` },
    { value: 'resolved', label: `Resolved${counts.resolved ? ` (${counts.resolved})` : ''}` },
  ]

  if (!canManage) {
    return (
      <section className="page-section comms-page">
        <Alert type="info" showIcon message="Parent reports are available to school administrators and principals." />
      </section>
    )
  }

  return (
    <section className="page-section comms-page">
      <header className="comms-heading">
        <div>
          <span className="comms-eyebrow">FROM THE PARENT APP</span>
          <h1>Parent reports</h1>
          <p>Issues raised in Acadex Connect land here. Reply once and the parent is alerted in the app.</p>
        </div>
        <div className="comms-heading-actions">
          <Button
            icon={<ReloadOutlined />}
            loading={listQuery.isFetching}
            onClick={() => { void listQuery.refetch(); if (selectedId) void detailQuery.refetch() }}
          >
            Refresh
          </Button>
        </div>
      </header>

      <div className="comms-stats">
        <StatCard label="Needs reply" value={counts.open} hint="Waiting for a school answer" tone="warn" icon={<WarningOutlined />} />
        <StatCard label="Waiting on parent" value={counts.awaiting_parent} hint="School replied, parent to respond" tone="info" icon={<ClockCircleOutlined />} />
        <StatCard label="Resolved" value={counts.resolved} hint="Closed after a reply" tone="ok" icon={<CheckCircleOutlined />} />
        <StatCard label="Unread" value={counts.unread} hint="New messages you have not opened" tone="accent" icon={<MailOutlined />} />
      </div>

      <div className={`comms-inbox${selectedId ? ' comms-inbox-open' : ''}`}>
        <aside className="comms-list" aria-label="Parent reports">
          <div className="comms-list-toolbar">
            <Input
              allowClear
              prefix={<SearchOutlined />}
              placeholder="Search subject, parent, child or reference"
              aria-label="Search parent reports"
              value={searchInput}
              onChange={event => setSearchInput(event.target.value)}
            />
            <div className="comms-list-filters">
              <Select
                aria-label="Filter by status"
                value={status}
                onChange={value => { setStatus(value); setPage(1) }}
                options={selectOptions}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => { void listQuery.refetch(); if (selectedId) void detailQuery.refetch() }}
                loading={listQuery.isFetching}
                aria-label="Refresh reports"
              />
            </div>
          </div>
          <div className="comms-list-count">
            {listQuery.isLoading ? 'Loading reports…' : `${listQuery.data?.total ?? 0} report${(listQuery.data?.total ?? 0) === 1 ? '' : 's'} · newest first`}
          </div>
          <div className="comms-list-scroll">
            {listQuery.isLoading && <div className="comms-skeletons">{[0, 1, 2, 3].map(key => <Skeleton key={key} active paragraph={{ rows: 2 }} />)}</div>}
            {listQuery.isError && (
              <Alert
                type="error" showIcon message="Could not load reports"
                description={formatApiError(listQuery.error)}
                action={<Button size="small" onClick={() => void listQuery.refetch()}>Retry</Button>}
              />
            )}
            {!listQuery.isLoading && !listQuery.isError && items.length === 0 && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={search || status !== 'all'
                  ? 'No reports match this filter.'
                  : 'No parent reports yet. Issues raised in the parent app land here.'}
              />
            )}
            {items.map(item => (
              <RequestRow
                key={item.id}
                item={item}
                active={item.id === selectedId}
                onOpen={() => openRequest(item.id)}
              />
            ))}
          </div>
          {(listQuery.data?.total ?? 0) > (listQuery.data?.page_size ?? 25) && (
            <div className="comms-pager">
              <Button size="small" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</Button>
              <span>Page {page} of {Math.ceil((listQuery.data?.total ?? 0) / (listQuery.data?.page_size ?? 25))}</span>
              <Button
                size="small"
                disabled={page >= Math.ceil((listQuery.data?.total ?? 0) / (listQuery.data?.page_size ?? 25))}
                onClick={() => setPage(current => current + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </aside>

        <section className="comms-thread" aria-label="Selected report">
          {!selectedId && (
            <div className="comms-thread-empty">
              <span className="comms-thread-empty-icon"><InboxOutlined /></span>
              <h2>Select a report</h2>
              <p>Reports arrive with the child, topic and full conversation. Reply once and the parent is notified in the app.</p>
              {counts.open > 0 && <span className="comms-thread-empty-hint">{counts.open} waiting for a reply</span>}
            </div>
          )}
          {selectedId && detailQuery.isLoading && <div className="comms-thread-loading"><Skeleton active paragraph={{ rows: 6 }} /></div>}
          {selectedId && detailQuery.isError && (
            <div className="comms-thread-loading">
              <Alert type="error" showIcon message="Could not open this report" description={formatApiError(detailQuery.error)} />
              <Button onClick={closeRequest}>Back to list</Button>
            </div>
          )}
          {detail && (
            <>
              <header className="comms-thread-head">
                <div className="comms-thread-head-main">
                  <div className="comms-thread-tags">
                    <StatusPill status={detail.status} />
                    <Tag className="comms-tag">{TOPIC_LABELS[detail.topic] ?? 'General'}</Tag>
                    <span className="comms-reference">{detail.reference}</span>
                  </div>
                  <h2>{detail.subject}</h2>
                  <p className="comms-thread-meta">
                    <span className="comms-thread-avatar">{initials(detail.guardian_name)}</span>
                    <strong>{detail.guardian_name}</strong>
                    {detail.student_name && <> · {detail.student_name}{detail.admission_number ? ` (${detail.admission_number})` : ''}</>}
                    {' · '}opened {dayjs(detail.created_at).format('D MMM YYYY, HH:mm')}
                  </p>
                  <p className="comms-thread-sub">
                    <MailOutlined /> {detail.guardian_email ?? 'No email on file'}
                    {detail.guardian_phone ? <> · {detail.guardian_phone}</> : null}
                    {answeredIn(detail) ? <> · first reply in {answeredIn(detail)}</> : null}
                  </p>
                </div>
                <div className="comms-thread-actions">
                  <Button className="comms-close-btn" onClick={closeRequest} aria-label="Close report">Close</Button>
                  {detail.status === 'resolved' ? (
                    <Button onClick={() => statusMutation.mutate('open')} loading={statusMutation.isPending}>Reopen</Button>
                  ) : (
                    <Button
                      type="primary" ghost icon={<CheckCircleOutlined />}
                      onClick={() => statusMutation.mutate('resolved')}
                      loading={statusMutation.isPending}
                    >
                      Mark resolved
                    </Button>
                  )}
                </div>
              </header>

              <div className="comms-messages" ref={messagesRef}>
                {detail.messages.map(entry => (
                  <article key={entry.id} className={`comms-message comms-message-${entry.author_role}`}>
                    <span className="comms-message-avatar">{initials(entry.author_name)}</span>
                    <div className="comms-bubble">
                      <div className="comms-bubble-head">
                        <strong>{entry.author_name}</strong>
                        <span>{entry.author_role === 'school' ? 'School office' : 'Parent'} · {dayjs(entry.created_at).format('D MMM, HH:mm')}</span>
                      </div>
                      <p>{entry.body}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="comms-composer">
                {detail.status === 'resolved' && (
                  <p className="comms-composer-note">This report is resolved. Sending a reply reopens it for the parent.</p>
                )}
                <TextArea
                  value={reply}
                  onChange={event => setReply(event.target.value)}
                  placeholder={`Reply to ${detail.guardian_name.replace(/\s+/g, ' ').split(' ')[0]}…`}
                  autoSize={{ minRows: 2, maxRows: 8 }}
                  maxLength={4000}
                  onKeyDown={event => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && reply.trim().length > 1) {
                      event.preventDefault()
                      replyMutation.mutate()
                    }
                  }}
                  aria-label="Reply message"
                />
                <div className="comms-composer-foot">
                  <span className="comms-composer-hint"><MessageOutlined /> The parent gets an in-app alert and a push notification.</span>
                  <Button
                    type="primary" icon={<SendOutlined />}
                    disabled={reply.trim().length < 2}
                    loading={replyMutation.isPending}
                    onClick={() => replyMutation.mutate()}
                  >
                    Send reply
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}

function RequestRow({ item, active, onOpen }: {
  item: ParentRequestSummary; active: boolean; onOpen: () => void
}) {
  return (
    <button
      type="button"
      className={`comms-item${active ? ' is-active' : ''}${item.unread ? ' is-unread' : ''}`}
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
    >
      <span className="comms-item-top">
        <span className="comms-item-avatar">{initials(item.guardian_name)}</span>
        <span className="comms-item-heading">
          <strong>{item.guardian_name}</strong>
          <time dateTime={item.last_message_at}>{timeAgo(item.last_message_at)}</time>
        </span>
        {item.unread && <span className="comms-dot" aria-label="Unread" />}
      </span>
      <span className="comms-item-subject">{item.subject}</span>
      <span className="comms-item-preview">{item.preview}</span>
      <span className="comms-item-meta">
        <span className={`comms-topic comms-topic-${item.topic}`}>{TOPIC_LABELS[item.topic] ?? 'General'}</span>
        {item.student_name && <span className="comms-item-child">{item.student_name}</span>}
        <StatusPill status={item.status} />
      </span>
    </button>
  )
}
