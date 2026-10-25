import { useState } from 'react'
import { Alert, Button, Input, Skeleton, Switch, Tabs, message } from 'antd'
import { AppstoreOutlined, BellOutlined, BookOutlined, CheckCircleFilled, CreditCardOutlined, LockOutlined, SafetyCertificateOutlined, SettingOutlined, TeamOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'
import { beginTotpSetup, disableTotp, enableTotp, fetchTotpStatus, type TotpSetup } from './settingsApi'

type SettingsTab = 'school' | 'users' | 'academic' | 'notifications' | 'billing' | 'system'

export default function SettingsPage() {
  const { accessToken, user } = useAuth()
  const { year, term } = useAcademicPeriod()
  const [activeTab, setActiveTab] = useState<SettingsTab>('school')
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
    { key: 'billing', label: <span className="settings-tab-label"><CreditCardOutlined/>Billing & subscription</span> },
    { key: 'system', label: <span className="settings-tab-label"><SettingOutlined/>System</span> },
  ]
  const codeInput = (label: string, value: string, setValue: (value: string) => void) => <Input aria-label={label} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="Enter 6-digit code" value={value} onChange={event => setValue(event.target.value.replace(/\D/g, '').slice(0, 6))}/>

  const content = () => {
    if (activeTab === 'billing') return <section className="settings-panel settings-placeholder"><span className="settings-icon amber"><CreditCardOutlined/></span><div><small>BILLING & SUBSCRIPTION</small><h2>Subscription management</h2><p>Subscription plans and billing tools are coming soon.</p><span className="settings-soon">Upcoming soon</span></div></section>
    if (activeTab === 'school') return <section className="settings-panel settings-profile-panel"><div className="settings-section-title"><span className="settings-icon blue"><AppstoreOutlined/></span><div><h2>General information</h2><p>Your school workspace details and administrator contact.</p></div></div><div className="settings-info-grid"><div><small>School name</small><strong>{user?.school_name ?? '—'}</strong></div><div><small>School address</small><strong>{user?.school_slug ?? '—'}</strong></div><div><small>Administrator</small><strong>{user?.display_name ?? '—'}</strong></div><div><small>Contact email</small><strong>{user?.email ?? '—'}</strong></div><div><small>Workspace access</small><strong className="capitalize-text">{user?.role.replaceAll('_', ' ') ?? '—'}</strong></div></div><Alert type="info" showIcon message="School details are managed by your account administrator."/></section>
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
