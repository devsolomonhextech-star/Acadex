import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  AppstoreOutlined, BarChartOutlined, BellOutlined, BookOutlined, CalendarOutlined,
  CreditCardOutlined, DashboardOutlined, MenuOutlined,  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  TrophyOutlined,
} from '@ant-design/icons'
import { Avatar, Badge, Button, Input } from 'antd'
import type { ReactNode } from 'react'
import type { SchoolUser } from '../api/types'

const navigation = [
  { label: 'Overview', to: '/', icon: <DashboardOutlined /> },
  { label: 'Students', to: '/students', icon: <TeamOutlined /> },
  { label: 'Classes & academics', to: '/classes', icon: <BookOutlined /> },
  { label: 'Assessment gradebook', to: '/assessments', icon: <BarChartOutlined /> },
  { label: 'Term results', to: '/results', icon: <TrophyOutlined /> },
  { label: 'Attendance', to: '/attendance', icon: <CalendarOutlined /> },
  { label: 'Finance', to: '/finance', icon: <CreditCardOutlined /> },
]

function initials(name: string) {
  return name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()
}

export function SchoolLayout({ children, user, onLogout }: { children: ReactNode; user: SchoolUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const currentPage = navigation.find(item => item.to === location.pathname)?.label
    ?? (location.pathname === '/report-card' ? 'Report card' : 'Overview')
  const canManageAcademics = ['school_admin', 'principal', 'registrar'].includes(user.role)
  const canTakeAttendance = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const canViewAssessments = ['school_admin', 'principal', 'registrar', 'teacher'].includes(user.role)
  const visibleNavigation = navigation.filter(item => {
    if (item.label === 'Students') return canManageAcademics
    if (item.label === 'Classes & academics') return canManageAcademics
    if (item.label === 'Attendance') return canTakeAttendance
    if (item.label === 'Assessment gradebook' || item.label === 'Term results') return canViewAssessments
    return true
  })
  return <div className="app-shell">
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-mark"><AppstoreOutlined /></div><span>school<span className="brand-accent">OS</span></span><button className="mobile-close" onClick={() => setOpen(false)} aria-label="Close menu">×</button></div>
      <div className="school-switch"><div className="school-emblem">{user.school_name.slice(0, 1).toUpperCase()}</div><div className="school-name"><strong>{user.school_name}</strong><span>{user.school_slug}</span></div><span className="chevron">⌄</span></div>
      <div className="nav-caption">WORKSPACE</div>
      <nav aria-label="Main navigation">{visibleNavigation.map(item => <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.to === '/'}>{item.icon}<span>{item.label}</span></NavLink>)}</nav>
      <div className="nav-caption tools-caption">SCHOOL TOOLS</div>
      <div className="nav-link nav-link-disabled" aria-disabled="true"><CalendarOutlined /><span>Academic calendar</span><small>Planned</small></div>
      <div className="nav-link nav-link-disabled" aria-disabled="true"><AppstoreOutlined /><span>Reports</span><small>Planned</small></div>
      <div className="sidebar-bottom"><div className="nav-link nav-link-disabled" aria-disabled="true"><SettingOutlined /><span>Settings</span><small>Planned</small></div><div className="help-card"><div className="help-icon">✳</div><strong>Need a hand?</strong><p>Visit the help center for tips and guides.</p><button disabled>Help center coming soon</button></div><div className="profile"><Avatar size={36} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar><div><strong>{user.display_name}</strong><span>{user.role.replaceAll('_', ' ')}</span></div><button className="logout-button" onClick={onLogout} title="Sign out" aria-label="Sign out">↗</button></div></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <main className="main-area"><header className="topbar"><Button className="menu-button" type="text" icon={<MenuOutlined />} onClick={() => setOpen(true)} aria-label="Open menu"/><div className="breadcrumbs">School <span>/</span> <strong>{currentPage}</strong></div><div className="top-actions"><Input className="search-box" prefix={<SearchOutlined />} placeholder="Search anything..." aria-label="Search" disabled/><Button className="icon-button" type="text" icon={<Badge dot color="#ec6e53"><BellOutlined /></Badge>} aria-label="Notifications" disabled/><div className="top-divider"/><Avatar size={34} style={{ backgroundColor: '#e5e9ff', color: '#384ec2', fontWeight: 700 }}>{initials(user.display_name)}</Avatar></div></header>{children}</main>
  </div>
}
