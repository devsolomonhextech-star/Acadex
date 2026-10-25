import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLessonAlerts } from '../../features/academic/useLessonAlerts'
import {
  AppstoreOutlined, BarChartOutlined, BellOutlined, BookOutlined, CalendarOutlined,
  CarOutlined, CreditCardOutlined, DashboardOutlined, FlagOutlined, HomeOutlined,
  MenuOutlined, MessageOutlined, ReadOutlined, SearchOutlined, SettingOutlined,
  TeamOutlined, TrophyOutlined, UserAddOutlined, UserOutlined,
} from '@ant-design/icons'
import { Avatar, Badge, Button, Input } from 'antd'
import type { ReactNode } from 'react'
import type { SchoolUser } from '../api/types'

type SidebarItem = { label: string; to?: string; icon: ReactNode }

const workspaceItems: SidebarItem[] = [
  { label: 'Overview', to: '/', icon: <DashboardOutlined /> },
  { label: 'Students', to: '/students', icon: <TeamOutlined /> },
  { label: 'Classes & academics', to: '/classes', icon: <BookOutlined /> },
  { label: 'Assessment gradebook', to: '/assessments', icon: <BarChartOutlined /> },
  { label: 'Term results', to: '/results', icon: <TrophyOutlined /> },
  { label: 'Attendance', to: '/attendance', icon: <CalendarOutlined /> },
  { label: 'Finance', to: '/finance', icon: <CreditCardOutlined /> },
  { label: 'Communications', to: '/communications', icon: <MessageOutlined /> },
  { label: 'Parent Portal', to: '/parents', icon: <UserOutlined /> },
]

// School tools: placeholders until their pages are built out.
const toolItems: SidebarItem[] = [
  { label: 'Academic calendar', icon: <CalendarOutlined /> },
  { label: 'Admissions', icon: <UserAddOutlined /> },
  { label: 'Library', icon: <ReadOutlined /> },
  { label: 'Transport', icon: <CarOutlined /> },
  { label: 'Hostel', icon: <HomeOutlined /> },
  { label: 'Events', icon: <FlagOutlined /> },
  { label: 'Reports', icon: <AppstoreOutlined /> },
]

const navigation = [...workspaceItems, ...toolItems]

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

export function SchoolLayout({ children, user, onLogout }: { children: ReactNode; user: SchoolUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const toggleSection = (key: string) =>
    setCollapsedSections(previous => ({ ...previous, [key]: !previous[key] }))
  const location = useLocation()
  const { alerts, dismiss, contextHolder } = useLessonAlerts()
  const currentPage = navigation.find(item => item.to === location.pathname)?.label
    ?? (location.pathname.startsWith('/students/') ? 'Student profile'
      : location.pathname === '/report-card' ? 'Report card' : 'Overview')
  const canManageAcademics = ['school_admin', 'principal', 'registrar'].includes(user.role)
  const canTakeAttendance = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const canViewAssessments = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const canViewFinance = ['school_admin', 'principal', 'finance'].includes(user.role)
  const visibleNavigation = workspaceItems.filter(item => {
    if (item.label === 'Students') return canManageAcademics
    if (item.label === 'Classes & academics') return canManageAcademics
    if (item.label === 'Attendance') return canTakeAttendance
    if (item.label === 'Assessment gradebook' || item.label === 'Term results') return canViewAssessments
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
      <div className="brand"><div className="brand-mark"><AppstoreOutlined /></div><span>school<span className="brand-accent">OS</span></span><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
      <div className="school-switch"><div className="school-emblem">{user.school_name.slice(0, 1).toUpperCase()}</div><div className="school-name"><strong>{user.school_name}</strong><span>{user.school_slug}</span></div><span className="chevron">⌄</span></div>
      <button type="button" className="nav-caption nav-section-toggle" aria-expanded={!collapsedSections.workspace}
        aria-controls="sidebar-workspace" onClick={() => toggleSection('workspace')}>
        <span>WORKSPACE</span><span className="section-chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsedSections.workspace && <nav id="sidebar-workspace" aria-label="Main navigation">{visibleNavigation.map(item => <NavLink key={item.to} to={item.to!} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.to === '/'}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>}
      <button type="button" className="nav-caption nav-section-toggle tools-caption" aria-expanded={!collapsedSections.tools}
        aria-controls="sidebar-tools" onClick={() => toggleSection('tools')}>
        <span>SCHOOL TOOLS</span><span className="section-chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsedSections.tools && <div id="sidebar-tools">{toolItems.map(item => <div key={item.label} className="nav-link nav-link-disabled" aria-disabled="true">{item.icon}<span>{item.label}</span><small>Planned</small></div>)}</div>}
      <div className="sidebar-bottom"><div className="nav-link nav-link-disabled" aria-disabled="true"><SettingOutlined /><span>Settings</span><small>Planned</small></div><div className="help-card"><div className="help-icon">✳</div><strong>Need a hand?</strong><p>Visit the help center for tips and guides.</p><button disabled>Help center coming soon</button></div><div className="profile"><Avatar size={36} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar><div><strong>{user.display_name}</strong><span>{user.role.replaceAll('_', ' ')}</span></div><button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button></div></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><Button className="menu-button" type="text" icon={<MenuOutlined />} onClick={() => setOpen(true)} aria-label="Open menu"/><div className="breadcrumbs">School <span>/</span> <strong>{currentPage}</strong></div><div className="top-actions"><Input className="search-box" prefix={<SearchOutlined />} placeholder="Search anything..." aria-label="Search" disabled/><Button className="icon-button" type="text" icon={<Badge dot color="#ec6e53"><BellOutlined /></Badge>} aria-label="Notifications" disabled/><div className="top-divider"/><Avatar size={34} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar></div></header>{children}</main>
  </div>
}
