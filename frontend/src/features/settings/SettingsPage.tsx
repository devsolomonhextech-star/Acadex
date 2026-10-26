import { useState } from 'react'
import { Alert, Button, Input, Skeleton, Switch, Tabs, message } from 'antd'
import { AppstoreOutlined, BellOutlined, BookOutlined, CheckCircleFilled, CreditCardOutlined, LockOutlined, SafetyCertificateOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { beginTotpSetup, disableTotp, enableTotp, fetchTotpStatus, type TotpSetup } from './settingsApi'
import SubscriptionSettings from './SubscriptionSettings'

type SettingsTab = 'school' | 'users' | 'academic' | 'notifications' | 'billing' | 'system'
type ProfileSection = 'general' | 'contact' | 'branding' | 'social' | 'location' | 'hours'

export default function SettingsPage() {
  const { accessToken, user } = useAuth()
  const { year, term } = useAcademicPeriod()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>(searchParams.get('tab') === 'billing' ? 'billing' : 'school')
  const [profileSection, setProfileSection] = useState<ProfileSection>('general')
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [enrollmentCode, setEnrollmentCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [disablePrompt, setDisablePrompt] = useState(false)
  const [toast, contextHolder] = message.useMessage()
  const client = useQueryClient()
  const status = useQuery({ queryKey: ['totp-status', user?.user_id], queryFn: () => fetchTotpStatus(accessToken!), enabled: Boolean(accessToken && user?.role === 'school_admin') })
  const refreshStatus = () => client.invalidateQueries({ queryKey: ['totp-status', user?.user_id] })
  const setupMutation = useMutation({ mutationFn: () => beginTotpSetup(accessToken!), onSuccess: value => { setSetup(value); setEnrollmentCode('') }, onError: error => toast.error(formatApiError(error)) })
  const enableMutation = useMutation({ mutationFn: () => enableTotp(accessToken!, enrollmentCode), onSuccess: async () => { setSetup(null); setEnrollmentCode(''); await refreshStatus(); toast.success('Two-factor authentication is enabled') }, onError: error => toast.error(formatApiError(error)) })
  const disableMutation = useMutation({ mutationFn: () => disableTotp(accessToken!, disableCode), onSuccess: async () => { setDisablePrompt(false); setDisableCode(''); await refreshStatus(); toast.success('Two-factor authentication is disabled') }, onError: error => toast.error(formatApiError(error)) })

  const tabs = [
    { key: 'school', label: <span className="settings-tab-label"><AppstoreOutlined/>School profile</span> },
    { key: 'users', label: <span className="settings-tab-label"><TeamOutlined/>Users & roles</span> },
    { key: 'academic', label: <span className="settings-tab-label"><BookOutlined/>Academic settings</span> },
    { key: 'notifications', label: <span className="settings-tab-label"><BellOutlined/>Notifications</span> },
    ...(user?.role === 'school_admin' ? [{ key: 'billing', label: <span className="settings-tab-label"><CreditCardOutlined/>Billing & subscription</span> }] : []),
    { key: 'system', label: <span className="settings-tab-label"><SettingOutlined/>System</span> },
  ]
  const codeInput = (label: string, value: string, setValue: (value: string) => void) => <Input aria-label={label} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter 6-digit code" value={value} onChange={event => setValue(event.target.value.replace(/\D/g, '').slice(0, 6))}/>

  const content = () => {
    if (activeTab === 'billing') return user?.role === 'school_admin' ? <SubscriptionSettings /> : null
    if (activeTab === 'school') {
      const sections: { key: ProfileSection; label: string }[] = [
        { key: 'general', label: 'General information' }, { key: 'contact', label: 'Contact information' },
        { key: 'branding', label: 'Logo & branding' }, { key: 'social', label: 'Social links' },
        { key: 'location', label: 'Location' }, { key: 'hours', label: 'School hours' },
      ]
      const profileDetails: Record<ProfileSection, { title: string; description: string; rows: [string, string][] }> = {
        general: { title: 'General information', description: 'Your school’s basic information and details.', rows: [['School name', user?.school_name ?? '—'], ['School address', user?.school_slug ?? '—'], ['School code', 'Not configured'], ['School type', 'Not configured']] },
        contact: { title: 'Contact information', description: 'The main account contact currently registered for this school.', rows: [['Administrator', user?.display_name ?? '—'], ['Email address', user?.email ?? '—'], ['Phone number', 'Not configured'], ['Website', 'Not configured']] },
        branding: { title: 'Logo & branding', description: 'School logo and brand colors are not configured yet.', rows: [['School logo', 'Not configured'], ['Primary color', 'Default SchoolOS blue']] },
        social: { title: 'Social links', description: 'Add school social profiles when those details are available.', rows: [['Facebook', 'Not configured'], ['Instagram', 'Not configured'], ['LinkedIn', 'Not configured']] },
        location: { title: 'Location', description: 'Your school location has not been added yet.', rows: [['Country', 'Not configured'], ['Region / state', 'Not configured'], ['City', 'Not configured'], ['Address', 'Not configured']] },
        hours: { title: 'School hours', description: 'School-wide operating hours have not been configured yet.', rows: [['School days', 'Not configured'], ['Opening time', 'Not configured'], ['Closing time', 'Not configured']] },
      }
      const detail = profileDetails[profileSection]
      return <section className="settings-panel settings-profile-layout"><nav className="settings-profile-nav" aria-label="School profile sections">{sections.map(section => <button type="button" key={section.key} className={profileSection === section.key ? 'active' : ''} onClick={() => setProfileSection(section.key)}>{section.label}</button>)}</nav><div className="settings-profile-detail"><div className="settings-section-title"><div><h2>{detail.title}</h2><p>{detail.description}</p></div></div><div className="settings-form-grid">{detail.rows.map(([label, value]) => <label key={label}><span>{label}</span><Input value={value} readOnly aria-label={label}/></label>)}</div><Alert type="info" showIcon message="These school profile fields are read-only in this version."/></div></section>
    }
    if (activeTab === 'academic') return <section className="settings-panel settings-profile-panel"><div className="settings-section-title"><span className="settings-icon blue"><BookOutlined/></span><div><h2>Academic settings</h2><p>Review the academic period currently selected in your workspace.</p></div></div><div className="settings-info-grid"><div><small>Academic year</small><strong>{year?.name ?? 'No academic year selected'}</strong></div><div><small>Year dates</small><strong>{year ? `${year.starts_on} – ${year.ends_on}` : '—'}</strong></div><div><small>Current term</small><strong>{term?.name ?? 'All terms'}</strong></div><div><small>Term dates</small><strong>{term ? `${term.starts_on} – ${term.ends_on}` : '—'}</strong></div></div><Alert type="info" showIcon message="Change the academic period from the top bar to view the matching school data."/></section>
    if (activeTab === 'users') return <section className="settings-panel settings-profile-panel"><div className="settings-section-title"><span className="settings-icon blue"><TeamOutlined/></span><div><h2>Users & roles</h2><p>School access is organized by role.</p></div></div><div className="settings-role-grid">{[['School administrator','Manage school setup, staff access, and security.'],['Principal','Oversee academics and school operations.'],['Registrar','Manage student records and academic structure.'],['Teacher','Work with assigned classes, attendance, and results.'],['Finance','Manage fees, payments, and financial reports.']].map(([name,description]) => <article key={name}><strong>{name}</strong><span>{description}</span></article>)}</div></section>
    if (activeTab === 'notifications') return <section className="settings-panel settings-placeholder"><span className="settings-icon blue"><BellOutlined/></span><div><small>NOTIFICATIONS</small><h2>School alerts</h2><p>Important attendance, finance, and school updates are available in the notification center.</p><span className="settings-soon">Notification preferences coming soon</span></div></section>
    return <section className="settings-panel settings-security-panel">
      <div className="settings-section-title"><span className="settings-icon blue"><SafetyCertificateOutlined/></span><div><h2>Security & access</h2><p>Protect your school administrator account with a second sign-in step.</p></div></div>
      <div className="settings-security-card">
        <div className="settings-security-heading"><span className="settings-icon green"><LockOutlined/></span><div><h3>Authenticator app</h3><p>Use Google Authenticator or another time-based one-time password app.</p></div>
          {status.isLoading ? <Skeleton.Button active size="small"/> : <Switch checked={Boolean(status.data?.enabled)} disabled={status.isError} loading={setupMutation.isPending || enableMutation.isPending || disableMutation.isPending} aria-label="Enable two-factor authentication" onChange={checked => checked ? setupMutation.mutate() : setDisablePrompt(true)}/>}
        </div>
        {status.isError && <Alert type="error" showIcon message={formatApiError(status.error)}/>}
        {status.data?.enabled && <div className="settings-active"><CheckCircleFilled/> Two-factor authentication is active for {user?.email}.</div>}
        {setup && <div className="settings-enroll">
          <div><h3>Connect your authenticator</h3><ol><li>Install and open Google Authenticator on your phone.</li><li>Tap <b>+</b>, then choose <b>Scan a QR code</b>.</li><li>Scan the code. The app will create a six-digit code that refreshes every 30 seconds.</li><li>Enter the current code below to confirm. You will need a fresh code at each sign-in.</li></ol><p>If you cannot scan, choose manual setup in the app and enter this key:</p><code>{setup.secret}</code></div>
          <div className="settings-qr"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_svg)}`} alt="Authenticator setup QR code"/><small>Scan with Google Authenticator</small></div>
          <div className="settings-confirm">{codeInput('Six-digit authenticator code', enrollmentCode, setEnrollmentCode)}<Button type="primary" disabled={enrollmentCode.length !== 6} loading={enableMutation.isPending} onClick={() => enableMutation.mutate()}>Confirm and enable</Button><Button onClick={() => setSetup(null)}>Cancel</Button></div>
        </div>}
        {disablePrompt && <div className="settings-disable"><div><b>Confirm this change</b><small>Enter a current authenticator code to turn off two-factor sign-in.</small></div>{codeInput('Authenticator code to disable two-factor authentication', disableCode, setDisableCode)}<Button danger type="primary" disabled={disableCode.length !== 6} loading={disableMutation.isPending} onClick={() => disableMutation.mutate()}>Disable</Button><Button onClick={() => { setDisablePrompt(false); setDisableCode('') }}>Cancel</Button></div>}
      </div>
      <Alert type="info" showIcon message="Keep your authenticator app available" description="SchoolOS never displays or stores your one-time codes. If you lose access to the app, contact your school administrator for account recovery."/>
    </section>
  }

  return <div className="page-content settings-page">{contextHolder}<header className="settings-header"><span className="settings-header-icon"><SettingOutlined/></span><div><h1>Settings</h1><p>Manage your school, users, and system preferences.</p></div></header><Tabs activeKey={activeTab} onChange={key => setActiveTab(key as SettingsTab)} items={tabs}/><div className="settings-content">{content()}</div></div>
}
