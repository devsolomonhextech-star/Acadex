import { useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../features/auth/authHooks'
import { apiRequest } from '../api/client'
import { useLessonAlerts } from '../../features/academic/useLessonAlerts'
import {
  AppstoreOutlined, ArrowRightOutlined, BarChartOutlined, BellOutlined, BookOutlined, CalendarOutlined,
  CarOutlined, CheckCircleOutlined, CreditCardOutlined, DashboardOutlined, FlagOutlined, GiftOutlined,
  HomeOutlined, LogoutOutlined, MenuOutlined, MessageOutlined, ReadOutlined, SearchOutlined, SettingOutlined,
  TeamOutlined, TrophyOutlined, UserAddOutlined, UserOutlined, HeartOutlined,
} from '@ant-design/icons'
import { Avatar, Badge, Button, Input, Popover, Select, Spin } from 'antd'
import type { ReactNode } from 'react'
import type { SchoolUser } from '../api/types'
import type { Notification } from '../api/types'
import { fetchNotifications, markNotificationRead } from '../api/notifications'
import { useAcademicPeriod } from '../academic/AcademicPeriodContext'

type SidebarItem = { label: string; to?: string; icon: ReactNode }

type TrialStatus = {
  in_trial: boolean
  trial_days_remaining: number
  trial_ends_at: string | null
}

const workspaceItems: SidebarItem[] = [
  { label: 'Overview', to: '/', icon: <DashboardOutlined /> },
  { label: 'Students', to: '/students', icon: <TeamOutlined /> },
  { label: 'Classes & academics', to: '/classes', icon: <BookOutlined /> },
  { label: 'Assessment gradebook', to: '/assessments', icon: <BarChartOutlined /> },
  { label: 'Tasks', to: '/tasks', icon: <CheckCircleOutlined /> },
  { label: 'My exams', to: '/student/exams', icon: <BookOutlined /> },
  { label: 'Student support', to: '/student-support', icon: <HeartOutlined /> },
  { label: 'Term results', to: '/results', icon: <TrophyOutlined /> },
  { label: 'Attendance', to: '/attendance', icon: <CalendarOutlined /> },
  { label: 'Finance', to: '/finance', icon: <CreditCardOutlined /> },
  { label: 'Communications', to: '/communications', icon: <MessageOutlined /> },
  { label: 'Parent Portal', to: '/parents', icon: <UserOutlined /> },
]

// School tools: the calendar is live; the remaining items are placeholders.
const toolItems: SidebarItem[] = [
  { label: 'Academic calendar', to: '/academic-calendar', icon: <CalendarOutlined /> },
  { label: 'Settings', to: '/settings', icon: <SettingOutlined /> },
  { label: 'Admissions', to: '/admissions', icon: <UserAddOutlined /> },
  { label: 'Library', icon: <ReadOutlined /> },
  { label: 'Transport', icon: <CarOutlined /> },
  { label: 'Hostel', icon: <HomeOutlined /> },
  { label: 'Events', icon: <FlagOutlined /> },
  { label: 'Reports', to: '/reports', icon: <AppstoreOutlined /> },
]

const navigation = [...workspaceItems, ...toolItems]

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

function relativeTime(value: string) {
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000)
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365], ['month', 60 * 60 * 24 * 30], ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24], ['hour', 60 * 60], ['minute', 60], ['second', 1],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, length] of units) {
    if (Math.abs(seconds) >= length || unit === 'second') return formatter.format(Math.round(seconds / length), unit)
  }
  return ''
}

function NotificationEntry({ notification, onOpen }: { notification: Notification; onOpen: (notification: Notification) => void }) {
  return <button type="button" className={`notification-entry${notification.read_at ? '' : ' notification-entry-unread'}`} onClick={() => onOpen(notification)}>
    <span className={`notification-entry-icon notification-type-${notification.type}`}><BellOutlined /></span>
    <span className="notification-entry-copy"><strong>{notification.title}</strong><span>{notification.body}</span><small>{relativeTime(notification.created_at)}</small></span>
    {!notification.read_at && <span className="notification-unread-dot" aria-label="Unread" />}
  </button>
}

export function SchoolLayout({ children, user, onLogout }: { children: ReactNode; user: SchoolUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) =>
    setCollapsedSections(previous => ({ ...previous, [key]: !previous[key] }))
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { accessToken } = useAuth()
  const { years, terms, yearId, termId, setYearId, setTermId, loading: periodLoading } = useAcademicPeriod()
  const { alerts, dismiss, contextHolder } = useLessonAlerts()
  // Free-trial countdown reminder for the administrators who own billing.
  const trial = useQuery({
    queryKey: ['school-subscription-status'],
    queryFn: () => apiRequest<TrialStatus>('/subscription', {}, accessToken!),
    enabled: Boolean(accessToken) && user.role === 'school_admin',
    staleTime: 5 * 60_000,
    refetchInterval: 30 * 60_000,
  })
  const trialInfo = trial.data?.in_trial ? trial.data : undefined
  const trialDays = trialInfo?.trial_days_remaining ?? 0
  const trialUrgent = Boolean(trialInfo) && trialDays <= 7
  const currentPage = navigation.find(item => item.to === location.pathname)?.label
    ?? (location.pathname.startsWith('/students/') ? 'Student profile'
      : location.pathname === '/report-card' ? 'Report card' : 'Overview')
  const canManageAcademics = ['school_admin', 'principal', 'registrar'].includes(user.role)
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchNotifications(accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const readNotification = useMutation({
    mutationFn: (id: string) => markNotificationRead(accessToken!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const readAllNotifications = useMutation({
    mutationFn: async () => {
      await Promise.all((notifications.data ?? []).filter(item => !item.read_at).map(item => markNotificationRead(accessToken!, item.id)))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const notificationItems = notifications.data ?? []
  const unreadCount = notificationItems.filter(item => !item.read_at).length
  const handleNotificationOpen = (notification: Notification) => {
    if (!notification.read_at) readNotification.mutate(notification.id)
    setNotificationsOpen(false)
    if (notification.link?.startsWith('/') && !notification.link.startsWith('//')) navigate(notification.link)
  }
  const roleLabel = user.role.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
  const canTakeAttendance = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const canViewAssessments = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const canViewFinance = ['school_admin', 'principal', 'finance'].includes(user.role)
  const visibleNavigation = workspaceItems.filter(item => {
    if (item.label === 'My exams') return user.role === 'student'
    if (item.label === 'Students') return canManageAcademics
    if (item.label === 'Classes & academics') return canManageAcademics
    if (item.label === 'Attendance') return canTakeAttendance
    if (item.label === 'Assessment gradebook' || item.label === 'Term results') return canViewAssessments
    if (item.label === 'Tasks') return canViewAssessments
    if (item.label === 'Student support') return ['school_admin', 'principal', 'registrar', 'teacher', 'staff'].includes(user.role)
    if (item.label === 'Finance') return canViewFinance
    if (item.label === 'Communications') return ['school_admin', 'principal'].includes(user.role)
    if (item.label === 'Parent Portal') return user.role === 'parent'
    return true
  })
  return <div className="app-shell">
    {contextHolder}
    {alerts.length > 0 && <div className="lesson-alerts" role="status" aria-live="polite">
      {alerts.map(alert => <div key={alert.key} className={`lesson-alert lesson-alert-${alert.kind}`}>
        <span className="lesson-alert-dot" />
        <div className="lesson-alert-text"><strong>{alert.title}</strong><span>{alert.detail}</span></div>
        <button className="lesson-alert-close" onClick={() => dismiss(alert.key)} aria-label="Dismiss alert">×</button>
      </div>)}
    </div>}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-logo" src="/brand/acadex-logo.png" alt="Acadex"/><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
      <div className="school-switch" aria-label={`Institution: ${user.school_name}`}>
        <div className="school-emblem" aria-hidden="true">{user.school_name.trim().slice(0, 1).toUpperCase()}</div>
        <div className="school-name">
          <span className="school-name-label">INSTITUTION</span>
          <strong title={user.school_name}>{user.school_name}</strong>
        </div>
      </div>
      <button type="button" className="nav-caption nav-section-toggle" aria-expanded={!collapsedSections.workspace}
        aria-controls="sidebar-workspace" onClick={() => toggleSection('workspace')}>
        <span>WORKSPACE</span><span className="section-chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsedSections.workspace && <nav id="sidebar-workspace" aria-label="Main navigation">{visibleNavigation.map(item => <NavLink key={item.to} to={item.to!} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.to === '/'}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>}
      <button type="button" className="nav-caption nav-section-toggle tools-caption" aria-expanded={!collapsedSections.tools}
        aria-controls="sidebar-tools" onClick={() => toggleSection('tools')}>
        <span>SCHOOL TOOLS</span><span className="section-chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsedSections.tools && <div id="sidebar-tools">{toolItems.filter(item => (item.label !== 'Settings' || ['school_admin', 'teacher'].includes(user.role)) && (item.label !== 'Admissions' || canManageAcademics) && (item.label !== 'Reports' || ['school_admin', 'principal', 'registrar', 'teacher', 'finance'].includes(user.role))).map(item => item.to
        ? <NavLink key={item.label} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>{item.icon}<span>{item.label}</span></NavLink>
        : <div key={item.label} className="nav-link nav-link-disabled" aria-disabled="true">{item.icon}<span>{item.label}</span><small>Planned</small></div>)}</div>}
      <div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✳</div><strong>Need a hand?</strong><p>Visit the help center for tips and guides.</p><button disabled>Help center coming soon</button></div><div className="profile"><Avatar size={36} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar><div><strong>{user.display_name}</strong><span>{user.role.replaceAll('_', ' ')}</span></div><button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button></div></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><Button className="menu-button" type="text" icon={<MenuOutlined />} onClick={() => setOpen(true)} aria-label="Open menu"/><img className="topbar-brand-mark" src="/brand/acadex-emblem.png" alt="Acadex"/><div className="breadcrumbs">School <span>/</span> <strong>{currentPage}</strong></div>{['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role) && <div className="top-period-picker" aria-label="Academic period">
      <Select aria-label="Academic year context" value={yearId || undefined} loading={periodLoading} placeholder="Academic year"
        options={years.map(year => ({ value: year.id, label: year.name }))} onChange={setYearId} />
      <Select aria-label="Term context" value={termId || undefined} loading={periodLoading} placeholder="Term"
        options={terms.map(term => ({ value: term.id, label: term.name }))} onChange={setTermId} disabled={!terms.length} />
    </div>}<div className="top-actions"><Input className="search-box" prefix={<SearchOutlined />} placeholder="Search anything..." aria-label="Search" disabled/>
      <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen} trigger="click" placement="bottomRight" arrow={false} className="top-menu-popover" content={
        <section className="top-menu-panel notifications-panel" aria-label="Notifications">
          <header className="top-menu-heading"><div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : 'You’re all caught up'}</span></div>
            {unreadCount > 0 && <Button type="link" size="small" loading={readAllNotifications.isPending} onClick={() => readAllNotifications.mutate()}>Mark all read</Button>}
          </header>
          <div className="notification-list">
            {notifications.isLoading ? <div className="top-menu-loading"><Spin size="small"/><span>Loading notifications…</span></div>
              : notifications.isError ? <div className="top-menu-empty"><strong>Notifications unavailable</strong><span>Please try again.</span><Button type="link" onClick={() => notifications.refetch()}>Retry</Button></div>
                : notificationItems.length === 0 ? <div className="top-menu-empty"><span className="top-menu-empty-icon"><BellOutlined /></span><strong>No notifications yet</strong><span>School updates will appear here.</span></div>
                  : notificationItems.map(item => <NotificationEntry key={item.id} notification={item} onOpen={handleNotificationOpen}/>)}
          </div>
        </section>
      }>
        <button type="button" className={`top-icon-trigger${notificationsOpen ? ' top-icon-trigger-active' : ''}`} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'} aria-expanded={notificationsOpen}>
          <Badge count={unreadCount} size="small" overflowCount={9} color="#e46d55"><BellOutlined /></Badge>
        </button>
      </Popover>
      <div className="top-divider"/>
      <Popover open={profileOpen} onOpenChange={setProfileOpen} trigger="click" placement="bottomRight" arrow={false} className="top-menu-popover" content={
        <section className="top-menu-panel profile-menu-panel" aria-label="Account menu">
          <div className="profile-menu-identity"><Avatar size={48} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar>
            <div><strong>{user.display_name}</strong><span>{user.email}</span><em>{roleLabel}</em></div>
          </div>
          <div className="profile-menu-school"><span>INSTITUTION</span><strong>{user.school_name}</strong></div>
          {['school_admin', 'teacher'].includes(user.role) && <NavLink className="profile-menu-link" to="/settings" onClick={() => setProfileOpen(false)}><SettingOutlined/><span>Account settings</span><span className="profile-link-hint">Manage your workspace</span></NavLink>}
          <button type="button" className="profile-menu-link profile-menu-logout" onClick={() => { setProfileOpen(false); onLogout() }}><LogoutOutlined/><span>Sign out</span></button>
        </section>
      }>
        <button type="button" className={`top-profile-trigger${profileOpen ? ' top-profile-trigger-active' : ''}`} aria-label={`Account menu for ${user.display_name}`} aria-expanded={profileOpen}>
          <Avatar size={34} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar>
          <span className="top-profile-name">{user.display_name}</span><span className="top-profile-chevron" aria-hidden="true">⌄</span>
        </button>
      </Popover>
    </div></header>{trialInfo && <div className={`trial-banner${trialUrgent ? ' trial-banner-urgent' : ''}`} role="status">
        <span className="trial-banner-icon"><GiftOutlined /></span>
        <div className="trial-banner-text">
          <strong>{trialUrgent ? 'Your free trial ends soon' : 'Free trial running'}</strong>
          <span>
            {trialDays > 1 ? `${trialDays} days remaining` : trialDays === 1 ? 'Tomorrow is your last day' : 'Today is your last day'}
            {trialInfo.trial_ends_at && ` · ends ${new Date(trialInfo.trial_ends_at).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </span>
        </div>
        <div className="trial-banner-countdown" aria-label={`${trialDays} days remaining`}>{trialDays}<small>{trialDays === 1 ? 'day' : 'days'} left</small></div>
        <NavLink to="/settings?tab=billing" className="trial-banner-cta" onClick={() => setOpen(false)}>View plans<ArrowRightOutlined /></NavLink>
      </div>}{children}</main>
  </div>
}
