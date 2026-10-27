import { useMemo, useState } from 'react'
import {
  Button, DatePicker, Form, Input, Modal, Select, Spin, Tag, message,
} from 'antd'
import {
  CheckCircleOutlined, DeleteOutlined, PlusOutlined,
  ClockCircleOutlined, FlagOutlined,
  SearchOutlined, CalendarOutlined,
  CheckOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
} from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { fetchTeachers } from '../academic/teachingApi'
import { createTask, deleteTask, fetchTasks, updateTaskStatus } from './tasksApi'
import type { Task, TaskCreate, TaskPriority, TaskStatus } from '../../shared/api/types'
import { formatApiError } from '../../shared/api/errors'

/* ─── Design tokens ────────────────────────────────────────── */
const T = {
  primary:     '#1D4ED8',
  primaryMid:  '#3B82F6',
  primaryLight:'#60A5FA',
  primaryPale: '#DBEAFE',
  primaryFaint:'#EFF6FF',
  surface:     '#FFFFFF',
  bg:          '#F8FAFF',
  border:      '#E2E8F0',
  borderLight: '#F1F5F9',
  textDark:    '#0F172A',
  textMid:     '#475569',
  textLight:   '#94A3B8',
  green:       '#16A34A',
  greenPale:   '#DCFCE7',
  amber:       '#D97706',
  amberPale:   '#FEF3C7',
  red:         '#DC2626',
  redPale:     '#FEE2E2',
  purple:      '#7C3AED',
  purplePale:  '#EDE9FE',
}

/* ─── Status / priority configs ────────────────────────────── */
const STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  open:        { label: 'Open',        color: T.primaryMid, bg: T.primaryPale, icon: '○' },
  in_progress: { label: 'In Progress', color: T.amber,      bg: T.amberPale,   icon: '◑' },
  completed:   { label: 'Completed',   color: T.green,      bg: T.greenPale,   icon: '●' },
  cancelled:   { label: 'Cancelled',   color: T.textLight,  bg: T.borderLight, icon: '✕' },
}

const PRIORITY_CFG: Record<TaskPriority, { label: string; color: string; bg: string; dot: string }> = {
  low:    { label: 'Low',    color: T.primaryMid, bg: T.primaryPale, dot: '▲' },
  medium: { label: 'Medium', color: T.amber,      bg: T.amberPale,   dot: '▲▲' },
  high:   { label: 'High',   color: T.red,        bg: T.redPale,     dot: '▲▲▲' },
}

type TaskFields = {
  title: string
  description: string
  priority: TaskPriority
  due_on: any
  assigned_to_membership_id: string
}

/* ─── Due date helper ───────────────────────────────────────── */
function relativeDue(dueOn: string | null): { text: string; color: string } {
  if (!dueOn) return { text: 'No due date', color: T.textLight }
  const due   = new Date(dueOn)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days  = Math.round((due.getTime() - today.getTime()) / 86400000)
  if (days < 0)  return { text: `Overdue by ${-days}d`, color: T.red }
  if (days === 0) return { text: 'Due today',            color: T.amber }
  if (days === 1) return { text: 'Due tomorrow',         color: T.amber }
  return { text: `Due in ${days} days`,                  color: T.textMid }
}

/* ─── Avatar initials ───────────────────────────────────────── */
function initials(name: string) {
  const parts = (name || '').trim().split(' ')
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : (name[0] || 'U').toUpperCase()
}

function avatarColor(name: string) {
  const colors = [T.primary, T.primaryMid, T.purple, T.green, T.amber, T.red]
  let sum = 0
  for (const c of name) sum += c.charCodeAt(0)
  return colors[sum % colors.length]
}

/* ═══════════════════════════════════════════════════════════
   TASK CARD
═══════════════════════════════════════════════════════════ */
interface TaskCardProps {
  task:       Task
  canManage:  boolean
  userId?:    string
  onStatus:   (task: Task, next: TaskStatus) => void
  onDelete:   (id: string) => void
  isUpdating: boolean
}

function TaskCard({ task, canManage, userId, onStatus, onDelete, isUpdating }: TaskCardProps) {
  const status   = STATUS_CFG[task.status as TaskStatus]
  const priority = PRIORITY_CFG[task.priority as TaskPriority]
  const due      = relativeDue(task.due_on)
  const isComplete   = task.status === 'completed'
  const canToggle    = canManage || Boolean(userId)
  const nameStr      = task.assigned_to_name ?? ''
  const bgColor      = avatarColor(nameStr)

  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'flex-start',
        gap:            16,
        padding:       '14px 20px',
        background:    T.surface,
        borderRadius:   12,
        border:        `1px solid ${T.border}`,
        transition:    'box-shadow 0.18s, border-color 0.18s',
        position:      'relative',
        opacity:        isComplete ? 0.72 : 1,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(29,78,216,0.08)'
        ;(e.currentTarget as HTMLDivElement).style.borderColor = T.primaryLight
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        ;(e.currentTarget as HTMLDivElement).style.borderColor = T.border
      }}
    >
      {/* ── Checkbox ── */}
      {canToggle && (
        <button
          onClick={() => onStatus(task, isComplete ? 'open' : 'completed')}
          disabled={isUpdating}
          style={{
            flexShrink:   0,
            width:         22,
            height:        22,
            marginTop:     2,
            borderRadius:  6,
            border:       `2px solid ${isComplete ? T.green : T.border}`,
            background:    isComplete ? T.green : 'transparent',
            cursor:       'pointer',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            transition:   'all 0.15s',
            padding:       0,
          }}
        >
          {isComplete && <CheckOutlined style={{ color: '#fff', fontSize: 11 }} />}
        </button>
      )}

      {/* ── Left accent bar ── */}
      <div style={{
        position:    'absolute',
        left:         0,
        top:          8,
        bottom:       8,
        width:         3,
        borderRadius: '0 3px 3px 0',
        background:    priority.color,
        opacity:       0.7,
      }} />

      {/* ── Main content ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <span style={{
            fontSize:       15,
            fontWeight:     600,
            color:          isComplete ? T.textLight : T.textDark,
            textDecoration: isComplete ? 'line-through' : 'none',
            lineHeight:     1.4,
            flex:           1,
          }}>
            {task.title}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <p style={{
            fontSize:    13,
            color:       T.textLight,
            margin:     '0 0 10px',
            lineHeight:  1.5,
            display:    '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow:   'hidden',
          }}>
            {task.description}
          </p>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {/* Status chip */}
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:           5,
            padding:      '3px 9px',
            borderRadius:  20,
            fontSize:      11,
            fontWeight:    600,
            background:    status.bg,
            color:         status.color,
            letterSpacing: '0.02em',
          }}>
            <span>{status.icon}</span>
            {status.label}
          </span>

          {/* Priority chip */}
          <span style={{
            display:      'inline-flex',
            alignItems:   'center',
            gap:           4,
            padding:      '3px 9px',
            borderRadius:  20,
            fontSize:      11,
            fontWeight:    600,
            background:    priority.bg,
            color:         priority.color,
          }}>
            <FlagOutlined style={{ fontSize: 10 }} />
            {priority.label}
          </span>

          {/* Due date */}
          <span style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:         4,
            fontSize:    12,
            color:       due.color,
            fontWeight:  due.color === T.red ? 600 : 400,
          }}>
            <ClockCircleOutlined style={{ fontSize: 11 }} />
            {due.text}
          </span>

          {/* Assignee */}
          <span style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:         6,
            marginLeft: 'auto',
            fontSize:    12,
            color:       T.textMid,
          }}>
            <span style={{
              width:          24,
              height:         24,
              borderRadius:   '50%',
              background:     bgColor,
              color:          '#fff',
              fontSize:        10,
              fontWeight:      700,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:      0,
            }}>
              {initials(nameStr)}
            </span>
            <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.assigned_to_name}
            </span>
          </span>
        </div>
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        {/* Created date */}
        <span style={{ fontSize: 11, color: T.textLight, whiteSpace: 'nowrap' }}>
          {new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>

        {/* Inline status select */}
        {canToggle && !isComplete && (
          <Select
            size="small"
            value={task.status}
            onChange={(next) => onStatus(task, next as TaskStatus)}
            style={{ width: 130 }}
            options={[
              { label: 'Open',        value: 'open' },
              { label: 'In Progress', value: 'in_progress' },
              { label: 'Completed',   value: 'completed' },
              { label: 'Cancelled',   value: 'cancelled' },
            ]}
          />
        )}

        {/* Delete */}
        {canManage && (
          <button
            onClick={() => onDelete(task.id)}
            style={{
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              color:        T.textLight,
              padding:      4,
              borderRadius: 6,
              display:     'flex',
              alignItems:  'center',
              transition:  'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = T.red)}
            onMouseLeave={e => (e.currentTarget.style.color = T.textLight)}
          >
            <DeleteOutlined style={{ fontSize: 14 }} />
          </button>
        )}
      </div>
    </div>
  )
}

function BoardTaskCard({ task, canManage, userId, onStatus, onDelete, isUpdating }: TaskCardProps) {
  const priority = PRIORITY_CFG[task.priority]
  const due = relativeDue(task.due_on)
  const assignee = task.assigned_to_name || 'Assigned staff'
  return <article className="task-board-card">
    <div className="task-board-card-top"><Tag color={task.priority === 'high' ? 'red' : task.priority === 'medium' ? 'gold' : 'blue'}>{priority.label} priority</Tag>{canManage && <button type="button" className="task-icon-action" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id)}><DeleteOutlined/></button>}</div>
    <h3>{task.title}</h3>
    {task.description && <p>{task.description}</p>}
    <div className="task-board-due" style={{ color: due.color }}><CalendarOutlined/>{due.text}</div>
    <div className="task-board-card-footer"><span className="task-board-assignee"><i style={{ background: avatarColor(assignee) }}>{initials(assignee)}</i><span>{assignee}</span></span>
      {(canManage || Boolean(userId)) && <Select size="small" aria-label={`Update status for ${task.title}`} value={task.status} onChange={next => onStatus(task, next as TaskStatus)} options={[
        { label: 'Open', value: 'open' }, { label: 'In progress', value: 'in_progress' },
        { label: 'Completed', value: 'completed' }, { label: 'Cancelled', value: 'cancelled' },
      ]} loading={isUpdating}/>}
    </div>
  </article>
}

/* ═══════════════════════════════════════════════════════════
   STATS BAR
═══════════════════════════════════════════════════════════ */
function StatsBar({ tasks }: { tasks: Task[] }) {
  const total     = tasks.length
  const completed = tasks.filter(t => t.status === 'completed').length
  const overdue   = tasks.filter(t => {
    if (!t.due_on || t.status === 'completed') return false
    return new Date(t.due_on) < new Date()
  }).length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length

  const stats = [
    { label: 'Total',       value: total,      color: T.primary,    bg: T.primaryPale  },
    { label: 'In Progress', value: inProgress, color: T.amber,      bg: T.amberPale    },
    { label: 'Completed',   value: completed,  color: T.green,      bg: T.greenPale    },
    { label: 'Overdue',     value: overdue,    color: T.red,        bg: T.redPale      },
  ]

  return (
    <div className="tasks-stats" style={{
      display:    'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap:         12,
      marginBottom: 20,
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background:   s.bg,
          borderRadius:  12,
          padding:      '14px 18px',
          border:       `1px solid ${s.color}25`,
        }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 12, color: s.color, marginTop: 4, fontWeight: 500, opacity: 0.8 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   GROUP HEADER
═══════════════════════════════════════════════════════════ */
function GroupHeader({ status, count }: { status: TaskStatus; count: number }) {
  const cfg = STATUS_CFG[status]
  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:         10,
      margin:     '24px 0 10px',
    }}>
      <span style={{
        width:          10,
        height:         10,
        borderRadius:   '50%',
        background:      cfg.color,
        flexShrink:      0,
        display:        'inline-block',
      }} />
      <span style={{ fontWeight: 700, fontSize: 13, color: T.textDark, letterSpacing: '0.01em' }}>
        {cfg.label}
      </span>
      <span style={{
        minWidth:       22,
        height:         20,
        borderRadius:    6,
        background:      cfg.bg,
        color:           cfg.color,
        fontSize:        11,
        fontWeight:      700,
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '0 6px',
      }}>
        {count}
      </span>
      <div style={{ flex: 1, height: 1, background: T.border, marginLeft: 4 }} />
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function TasksPage() {
  const { accessToken, user } = useAuth()
  const queryClient           = useQueryClient()
  const [toast]               = message.useMessage()
  const [createOpen, setCreateOpen]     = useState(false)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')
  const [search, setSearch]             = useState('')
  const [groupBy, setGroupBy]           = useState<'status' | 'priority' | 'none'>('status')
  const [view, setView]                 = useState<'board' | 'list'>('board')
  const [createForm]                    = Form.useForm<TaskFields>()

  const canManage = ['school_admin', 'principal'].includes(user?.role ?? '')

  const teachersQuery = useQuery({
    queryKey: ['task-assignable-teachers', user?.school_id],
    queryFn:  () => fetchTeachers(accessToken!),
    enabled:  !!accessToken && canManage,
  })
  const teachers = teachersQuery.data ?? []

  const tasksQuery = useQuery({
    queryKey: ['tasks', user?.school_id, statusFilter === 'all' ? null : statusFilter],
    queryFn:  () => fetchTasks(accessToken!, {
      status:    statusFilter === 'all' ? undefined : statusFilter,
      page_size: 100,
    }),
    enabled: !!accessToken,
  })
  const tasks = tasksQuery.data ?? []

  const visibleTasks = useMemo(() => {
    let list = [...tasks]
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q) ||
        (t.assigned_to_name ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [tasks, statusFilter, search])

  /* ── Mutations ── */
  const createMutation = useMutation({
    mutationFn: (payload: TaskCreate) => createTask(accessToken!, payload),
    onSuccess: () => {
      setCreateOpen(false)
      createForm.resetFields()
      void queryClient.invalidateQueries({ queryKey: ['tasks', user?.school_id] })
      toast.success('Task assigned successfully.')
    },
    onError: (e: unknown) => toast.error(formatApiError(e)),
  })

  const statusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      updateTaskStatus(accessToken!, taskId, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks', user?.school_id] }),
    onError:   (e: unknown) => toast.error(formatApiError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteTask(accessToken!, taskId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['tasks', user?.school_id] }),
    onError:   (e: unknown) => toast.error(formatApiError(e)),
  })

  const handleCreate = () => {
    if (!createForm.validateFields()) return
    const v = createForm.getFieldsValue(true)
    void createMutation.mutate({
      title:                     v.title,
      description:               v.description || null,
      priority:                  v.priority,
      due_on:                    v.due_on ? v.due_on.format('YYYY-MM-DD') : null,
      assigned_to_membership_id: v.assigned_to_membership_id,
    })
  }

  const handleStatus = (task: Task, next: TaskStatus) => {
    void statusMutation.mutate({ taskId: task.id, status: next })
  }

  const handleDelete = (id: string) => {
    if (!window.confirm('Delete this task?')) return
    void deleteMutation.mutate(id)
  }

  /* ── Grouping ── */
  const groupOrder: TaskStatus[] = ['in_progress', 'open', 'completed', 'cancelled']

  const grouped = useMemo(() => {
    if (groupBy === 'none') return { all: visibleTasks }
    if (groupBy === 'priority') {
      const o: Record<string, Task[]> = { high: [], medium: [], low: [] }
      visibleTasks.forEach(t => { if (o[t.priority]) o[t.priority].push(t) })
      return o
    }
    // status grouping
    const o: Record<string, Task[]> = {}
    groupOrder.forEach(s => { o[s] = [] })
    visibleTasks.forEach(t => { if (o[t.status]) o[t.status].push(t) })
    return o
  }, [visibleTasks, groupBy])

  const boardOrder: TaskStatus[] = ['open', 'in_progress', 'completed', 'cancelled']

  return (
    <>
      <style>{`
        .tasks-modal .ant-modal-content { border-radius: 16px !important; overflow: hidden; }
        .tasks-modal .ant-modal-header { border-bottom: 1px solid ${T.border} !important; padding: 20px 24px 16px !important; }
        .tasks-modal .ant-modal-title { font-weight: 700 !important; font-size: 16px !important; color: ${T.textDark} !important; }
        .tasks-modal .ant-form-item-label label { font-size: 12px !important; font-weight: 600 !important; color: ${T.textMid} !important; text-transform: uppercase; letter-spacing: 0.04em; }
        .tasks-modal .ant-input, .tasks-modal .ant-input-affix-wrapper,
        .tasks-modal .ant-select-selector, .tasks-modal .ant-picker { border-radius: 8px !important; border: 1.5px solid ${T.border} !important; }
        .tasks-modal .ant-btn-primary { background: linear-gradient(135deg, ${T.primary}, ${T.primaryMid}) !important; border: none !important; border-radius: 8px !important; height: 38px !important; font-weight: 600 !important; }
        .tasks-modal .ant-btn-default { border-radius: 8px !important; height: 38px !important; }
      `}</style>
      <main className="tasks-workspace">
        <div className="tasks-page-shell">
          <header className="tasks-page-head">
            <div>
              <span className="tasks-eyebrow">WORKSPACE <i/> STAFF OPERATIONS</span>
              <h1>Tasks</h1>
              <p>Keep school work organised, assign owners and see what needs attention.</p>
            </div>
            {canManage && <Button type="primary" size="large" icon={<PlusOutlined/>} onClick={() => setCreateOpen(true)}>New task</Button>}
          </header>

          {tasks.length > 0 && <StatsBar tasks={tasks} />}

          <section className="tasks-toolbar" aria-label="Task views and filters">
            <div className="tasks-toolbar-filters">
              <Input className="tasks-search" prefix={<SearchOutlined/>} placeholder="Search tasks or assignees" value={search} onChange={event => setSearch(event.target.value)} allowClear/>
              <Select className="tasks-select" value={statusFilter} onChange={setStatusFilter} aria-label="Filter by status" options={[
                { label: 'All statuses', value: 'all' }, { label: 'Open', value: 'open' },
                { label: 'In progress', value: 'in_progress' }, { label: 'Completed', value: 'completed' },
                { label: 'Cancelled', value: 'cancelled' },
              ]}/>
              {view === 'list' && <Select className="tasks-select" value={groupBy} onChange={setGroupBy} aria-label="Group tasks by" options={[
                { label: 'Group by status', value: 'status' }, { label: 'Group by priority', value: 'priority' }, { label: 'No grouping', value: 'none' },
              ]}/>}
            </div>
            <div className="tasks-toolbar-tools">
              <span className="tasks-result-count">{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</span>
              <div className="tasks-view-switch" role="group" aria-label="Choose task view">
                <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><AppstoreOutlined/> Board</button>
                <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><UnorderedListOutlined/> List</button>
              </div>
              <Button aria-label="Refresh tasks" icon={<ReloadOutlined/>} onClick={() => void tasksQuery.refetch()} loading={tasksQuery.isFetching}/>
            </div>
          </section>

          <Spin spinning={tasksQuery.isFetching}>
            {visibleTasks.length === 0 && !tasksQuery.isFetching ? (
              <div className="tasks-empty-state">
                <span><CheckCircleOutlined/></span>
                <h2>{search ? 'No matching tasks' : 'Your task space is clear'}</h2>
                <p>{search ? 'Try another search or status filter.' : canManage ? 'Create a task or generate demo data from the admin dashboard to populate your board.' : 'Tasks assigned to you will appear here.'}</p>
                {canManage && !search && <Button type="primary" icon={<PlusOutlined/>} onClick={() => setCreateOpen(true)}>Create a task</Button>}
              </div>
            ) : view === 'board' ? (
              <div className="tasks-board">
                {boardOrder.map(status => {
                  const cfg = STATUS_CFG[status]
                  const items = visibleTasks.filter(task => task.status === status)
                  return <section className={`tasks-board-column tasks-column-${status}`} key={status}>
                    <header><span className="tasks-column-dot" style={{ background: cfg.color }}/><h2>{cfg.label}</h2><span className="tasks-column-count">{items.length}</span></header>
                    <div className="tasks-board-cards">
                      {items.length ? items.map(task => <BoardTaskCard key={task.id} task={task} canManage={canManage} userId={user?.user_id} onStatus={handleStatus} onDelete={handleDelete} isUpdating={statusMutation.isPending}/>) : <p className="tasks-column-empty">No tasks here</p>}
                    </div>
                    {canManage && <button type="button" className="tasks-add-to-column" onClick={() => setCreateOpen(true)}><PlusOutlined/> Add task</button>}
                  </section>
                })}
              </div>
            ) : (
              <div className="tasks-list-view">
                {Object.entries(grouped).map(([group, groupTasks]) => {
                  if (!groupTasks.length) return null
                  return <section className="tasks-list-group" key={group}>
                    {groupBy === 'status' ? <GroupHeader status={group as TaskStatus} count={groupTasks.length}/> : groupBy === 'priority' ? <header><FlagOutlined/><strong>{group.charAt(0).toUpperCase() + group.slice(1)} priority</strong><span>{groupTasks.length}</span></header> : null}
                    <div>{groupTasks.map(task => <TaskCard key={task.id} task={task} canManage={canManage} userId={user?.user_id} onStatus={handleStatus} onDelete={handleDelete} isUpdating={statusMutation.isPending}/>)}</div>
                  </section>
                })}
              </div>
            )}
          </Spin>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════════════
          CREATE TASK MODAL
      ═══════════════════════════════════════════════════════ */}
      {canManage && (
        <Modal
          open={createOpen}
          onCancel={() => { setCreateOpen(false); createForm.resetFields() }}
          onOk={handleCreate}
          okText="Assign task"
          cancelText="Cancel"
          confirmLoading={createMutation.isPending}
          className="tasks-modal"
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width:          30,
                height:         30,
                borderRadius:   8,
                background:    `linear-gradient(135deg, ${T.primary}, ${T.primaryMid})`,
                display:       'flex',
                alignItems:    'center',
                justifyContent:'center',
              }}>
                <PlusOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <span>Assign a new task</span>
            </div>
          }
          width={520}
        >
          <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
            {/* Title */}
            <Form.Item
              name="title"
              label="Task title"
              rules={[
                { required: true, message: 'Enter a task title' },
                { min: 2, max: 160 },
              ]}
            >
              <Input
                placeholder="e.g. Upload Term 2 results by Friday"
                size="large"
                style={{ borderRadius: 8, fontSize: 14 }}
              />
            </Form.Item>

            {/* Description */}
            <Form.Item name="description" label="Description (optional)">
              <Input.TextArea
                rows={3}
                placeholder="What needs to be done? Add any context or requirements…"
                style={{ borderRadius: 8, resize: 'none' }}
              />
            </Form.Item>

            {/* Assign to */}
            <Form.Item
              name="assigned_to_membership_id"
              label="Assign to"
              rules={[{ required: true, message: 'Select a teacher' }]}
            >
              <Select
                placeholder="Choose a teacher…"
                size="large"
                showSearch
                optionFilterProp="label"
                options={teachers.map(t => ({
                  value: t.membership_id,
                  label: `${t.display_name} · ${t.email}`,
                }))}
              />
            </Form.Item>

            {/* Priority + Due date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item
                name="priority"
                label="Priority"
                initialValue="medium"
                rules={[{ required: true }]}
              >
                <Select
                  size="large"
                  options={[
                    { label: '🔵  Low',    value: 'low' },
                    { label: '🟡  Medium', value: 'medium' },
                    { label: '🔴  High',   value: 'high' },
                  ]}
                />
              </Form.Item>

              <Form.Item name="due_on" label="Due date">
                <DatePicker
                  placeholder="Pick a date"
                  size="large"
                  style={{ width: '100%', borderRadius: 8 }}
                  suffixIcon={<CalendarOutlined style={{ color: T.textLight }} />}
                />
              </Form.Item>
            </div>

            {/* Info note */}
            <div style={{
              padding:      '10px 14px',
              borderRadius:  8,
              background:    T.primaryFaint,
              border:       `1px solid ${T.primaryPale}`,
              fontSize:      12,
              color:         T.primary,
              display:      'flex',
              alignItems:   'flex-start',
              gap:           8,
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>ℹ</span>
              The assigned teacher will be notified and can update the task status from their dashboard.
            </div>
          </Form>
        </Modal>
      )}
    </>
  )
}
