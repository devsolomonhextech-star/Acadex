import { useState } from 'react'
import { Alert, Button, Input } from 'antd'
import { AppstoreOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { acceptTeacherInvitation } from '../academic/teachingApi'

export default function AcceptInvitationPage() {
  const [search] = useSearchParams()
  const token = search.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [result, setResult] = useState<{ email: string; school_name: string; school_slug: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setError('')
    setBusy(true)
    try {
      const accepted = await acceptTeacherInvitation({ token, ...(password ? { password } : {}) })
      setResult(accepted)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to accept this invitation') }
    finally { setBusy(false) }
  }
  return <main className="invite-page">
    <Link to="/login" className="invite-brand"><span><AppstoreOutlined/></span> school<span>OS</span></Link>
    <section className="invite-card">
      <div className="auth-card-kicker">TEACHER INVITATION</div>
      {result ? <><h1>Welcome to {result.school_name}</h1><p>Your teacher account is ready. Sign in to open your classes and attendance workspace.</p><Alert showIcon type="success" message={result.email}/><Link className="invite-login-link" to={`/login?school=${encodeURIComponent(result.school_slug)}&email=${encodeURIComponent(result.email)}`}>Continue to sign in</Link></>
        : <><h1>Join your school</h1><p>Accept the invitation to join the school as a teacher. Existing SchoolOS accounts keep their current password.</p>{error && <Alert className="auth-alert" showIcon type="error" message={error}/>}<label className="invite-password-label">Password for a new account</label><Input.Password value={password} onChange={event => setPassword(event.target.value)} prefix={<LockOutlined/>} placeholder="At least 12 characters" autoComplete="new-password" minLength={12}/><small className="invite-hint">Leave this blank if you already have a SchoolOS account.</small><Button type="primary" block loading={busy} disabled={!token} onClick={() => void submit()}>Accept teacher invitation</Button>{!token && <Alert className="auth-alert" type="error" message="This invitation link is missing its token."/>}</>}
      <div className="invite-security"><SafetyCertificateOutlined/> Invitation links expire after seven days and can only be used once.</div>
    </section>
  </main>
}
