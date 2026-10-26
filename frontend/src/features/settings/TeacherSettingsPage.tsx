import { useState } from 'react'
import { Alert, Button, Input, Skeleton, Switch, message } from 'antd'
import { CheckCircleFilled, KeyOutlined, LockOutlined, SafetyCertificateOutlined, SettingOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/authHooks'
import { formatApiError } from '../../shared/api/errors'
import { beginTotpSetup, disableTotp, enableTotp, fetchTotpStatus, type TotpSetup } from './settingsApi'

export default function TeacherSettingsPage() {
  const { accessToken, user } = useAuth()
  const client = useQueryClient()
  const [toast, holder] = message.useMessage()
  const [setup, setSetup] = useState<TotpSetup | null>(null)
  const [enableCode, setEnableCode] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [confirmDisable, setConfirmDisable] = useState(false)
  const status = useQuery({
    queryKey: ['totp-status', user?.user_id],
    queryFn: () => fetchTotpStatus(accessToken!),
    enabled: !!accessToken,
  })
  const refresh = () => client.invalidateQueries({ queryKey: ['totp-status', user?.user_id] })
  const setupMutation = useMutation({
    mutationFn: () => beginTotpSetup(accessToken!),
    onSuccess: result => { setSetup(result); setEnableCode('') },
    onError: error => toast.error(formatApiError(error)),
  })
  const enableMutation = useMutation({
    mutationFn: () => enableTotp(accessToken!, enableCode),
    onSuccess: async () => { setSetup(null); setEnableCode(''); await refresh(); toast.success('Two-factor authentication is enabled') },
    onError: error => toast.error(formatApiError(error)),
  })
  const disableMutation = useMutation({
    mutationFn: () => disableTotp(accessToken!, disableCode),
    onSuccess: async () => { setConfirmDisable(false); setDisableCode(''); await refresh(); toast.success('Two-factor authentication is disabled') },
    onError: error => toast.error(formatApiError(error)),
  })
  const codeField = (label: string, value: string, onChange: (code: string) => void) => <Input
    aria-label={label} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
    placeholder="Enter 6-digit code" value={value}
    onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
  />

  return <div className="page-content teacher-settings-page">
    {holder}
    <header className="teacher-settings-heading"><span><SettingOutlined /></span><div><div className="eyebrow">ACCOUNT PREFERENCES</div><h1>Settings</h1><p>Manage your personal sign-in security.</p></div></header>
    <section className="teacher-settings-card">
      <div className="teacher-settings-card-head"><span className="teacher-settings-security-icon"><SafetyCertificateOutlined /></span><div><h2>Two-factor authentication</h2><p>Add a time-based code from an authenticator app when you sign in.</p></div>
        {status.isLoading ? <Skeleton.Button active size="small" /> : <Switch checked={Boolean(status.data?.enabled)} loading={setupMutation.isPending || enableMutation.isPending || disableMutation.isPending} disabled={status.isError} aria-label="Enable two-factor authentication" onChange={checked => checked ? setupMutation.mutate() : setConfirmDisable(true)} />}
      </div>
      {status.isError && <Alert type="error" showIcon message="Could not load security status" description={formatApiError(status.error)} />}
      {status.data?.enabled && <div className="teacher-settings-active"><CheckCircleFilled /><span><b>Two-factor authentication is active</b><small>Sign-in codes are required for {user?.email}.</small></span></div>}
      {!status.data?.enabled && !setup && <div className="teacher-settings-explainer"><div><LockOutlined /><span><b>Extra protection for your account</b><small>After enabling this feature, your password and a fresh six-digit authenticator code will be required each time you sign in.</small></span></div><Button type="primary" loading={setupMutation.isPending} onClick={() => setupMutation.mutate()}>Set up authenticator</Button></div>}
      {setup && <div className="teacher-settings-enroll">
        <div className="teacher-settings-steps"><h3>Connect your authenticator</h3><ol><li>Install and open Google Authenticator on your phone.</li><li>Tap <b>+</b> and choose <b>Scan a QR code</b>.</li><li>Scan the code below. The app will create a six-digit code that refreshes every 30 seconds.</li><li>Enter the current code to confirm and activate two-factor sign-in.</li></ol><p>If you can’t scan, add an account manually with this setup key:</p><code>{setup.secret}</code></div>
        <div className="teacher-settings-qr"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qr_svg)}`} alt="Scan to connect an authenticator app" /><span>Scan with Google Authenticator</span></div>
        <div className="teacher-settings-confirm">{codeField('Six-digit authenticator code', enableCode, setEnableCode)}<Button type="primary" disabled={enableCode.length !== 6} loading={enableMutation.isPending} onClick={() => enableMutation.mutate()}>Confirm and enable</Button><Button onClick={() => { setSetup(null); setEnableCode('') }}>Cancel setup</Button></div>
      </div>}
      {confirmDisable && <div className="teacher-settings-disable"><div><b>Confirm turning off two-factor authentication</b><small>Enter a current authenticator code to confirm this change.</small></div>{codeField('Code to disable two-factor authentication', disableCode, setDisableCode)}<Button danger type="primary" disabled={disableCode.length !== 6} loading={disableMutation.isPending} onClick={() => disableMutation.mutate()}>Disable</Button><Button onClick={() => { setConfirmDisable(false); setDisableCode('') }}>Cancel</Button></div>}
    </section>
    <div className="teacher-settings-note"><KeyOutlined /><span><b>Keep your authenticator available</b><small>If you lose access to the app, contact your school administrator for account recovery. Never share your one-time codes.</small></span></div>
  </div>
}
