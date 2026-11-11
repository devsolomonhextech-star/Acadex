import { useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Avatar, Dropdown, Spin } from 'antd'
import type { MenuProps } from 'antd'
import {
  BankOutlined, DashboardOutlined, GlobalOutlined, LogoutOutlined, MenuOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { useSuperAdmin } from './SuperAdminAuth'

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/superadmin': { title: 'Platform overview', subtitle: 'The schools, people and subscriptions running on Acadex.' },
  '/superadmin/schools': { title: 'Schools', subtitle: 'Every workspace on the platform, with its administrator and plan.' },
  '/superadmin/landing-page': { title: 'Landing page', subtitle: 'Choose which active school names and logos appear publicly.' },
}

const NAV = [
  { to: '/superadmin', label: 'Overview', icon: <DashboardOutlined/>, end: true },
  { to: '/superadmin/schools', label: 'Schools', icon: <BankOutlined/>, end: false },
  { to: '/superadmin/landing-page', label: 'Landing page', icon: <GlobalOutlined/>, end: false },
]

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

export default function SuperAdminLayout() {
  const { admin, loading, signOut } = useSuperAdmin()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [location.pathname])

  if (loading) return <main className="sa-boot"><Spin size="large"/><span>Opening the platform console…</span></main>
  if (!admin) return <Navigate to="/superadmin/login" replace/>

  const metadata = TITLES[location.pathname] ?? { title: 'Platform console', subtitle: 'Acadex operations.' }
  const accountMenu: MenuProps['items'] = [
    { key: 'identity', label: <div className="sa-account-summary"><strong>{admin.display_name}</strong><span>{admin.email}</span></div>, disabled: true },
    { type: 'divider' },
    {
      key: 'signout', icon: <LogoutOutlined/>, label: 'Sign out',
      onClick: () => { void signOut() },
    },
  ]

  return <div className="sa-shell">
    {menuOpen && <button className="sa-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)}/>}
    <aside className={`sa-sidebar${menuOpen ? ' open' : ''}`}>
      <div className="sa-brand">
        <span className="sa-mark"><SafetyCertificateOutlined/></span>
        <div><strong>Acadex</strong><small>Platform console</small></div>
      </div>
      <nav className="sa-nav" aria-label="Platform navigation">
        <span className="sa-nav-label">Workspace</span>
        {NAV.map(item => <NavLink
          key={item.to} to={item.to} end={item.end}
          className={({ isActive }) => `sa-nav-item${isActive ? ' active' : ''}`}
        >
          {item.icon}<span>{item.label}</span>
        </NavLink>)}
      </nav>
      <div className="sa-sidebar-foot">
        <div className="sa-signed-in">
          <Avatar size={34} className="sa-avatar">{initials(admin.display_name)}</Avatar>
          <div><strong>{admin.display_name}</strong><span>{admin.role === 'superadmin' ? 'Superadmin' : 'Support'}</span></div>
          <button className="sa-signout" title="Sign out" aria-label="Sign out" onClick={() => { void signOut() }}><LogoutOutlined/></button>
        </div>
        <span className="sa-version">Acadex Platform · internal</span>
      </div>
    </aside>

    <div className="sa-main">
      <header className="sa-topbar">
        <div className="sa-topbar-left">
          <button className="sa-menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(open => !open)}><MenuOutlined/></button>
          <div>
            <h1>{metadata.title}</h1>
            <p>{metadata.subtitle}</p>
          </div>
        </div>
        <div className="sa-topbar-right">
          <span className="sa-env-pill">Internal</span>
          <Dropdown menu={{ items: accountMenu }} trigger={['click']} placement="bottomRight">
            <button className="sa-account-button" aria-label="Account menu">
              <Avatar size={30} className="sa-avatar">{initials(admin.display_name)}</Avatar>
              <span>{admin.display_name}</span>
            </button>
          </Dropdown>
        </div>
      </header>
      <main className="sa-content"><Outlet/></main>
      <footer className="sa-footer">
        <span>© 2026 Acadex · Platform operations</span>
        <Link to="/superadmin/schools">Browse schools</Link>
      </footer>
    </div>
  </div>
}
