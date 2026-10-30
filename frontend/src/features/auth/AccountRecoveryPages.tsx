import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Alert, Button, Input } from 'antd'
import { ArrowRightOutlined, LockOutlined, MailOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
import { completePasswordReset, confirmEmail, requestPasswordReset, resendEmailVerification } from '../../shared/api/client'

function AccountCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="auth-layout"><main className="auth-main"><section className="auth-card"><Link to="/login" className="auth-brand"><img src="/brand/acadex-logo.png" alt="Acadex" /></Link><div className="auth-card-kicker">ACCOUNT SECURITY</div><h2>{title}</h2>{children}<div className="auth-security"><LockOutlined/> Secure, one-time account links</div></section></main></div>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setBusy(true); setError('')
    try { await requestPasswordReset(email.trim().toLowerCase()); setSent(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to request a reset link') }
    finally { setBusy(false) }
  }
  return <AccountCard title="Reset your password"><p className="auth-intro">Enter your account email and we’ll send a secure reset link if it matches an account.</p>{error && <Alert type="error" showIcon message={error}/>} {sent ? <Alert type="success" showIcon message="Check your inbox" description="If an account exists for that email, reset instructions have been sent."/> : <div className="auth-form"><label>Email address</label><Input value={email} onChange={event => setEmail(event.target.value)} prefix={<MailOutlined/>} type="email" autoComplete="email" placeholder="you@school.edu.gh"/><Button type="primary" loading={busy} disabled={!email.includes('@')} onClick={() => void submit()} className="auth-submit">Send reset link <ArrowRightOutlined/></Button></div>}<Link to="/login" className="create-account">Back to sign in</Link></AccountCard>
}

export function ResetPasswordPage() {
  const [search] = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (password.length < 12) { setError('Use at least 12 characters for your new password.'); return }
    if (password !== confirmation) { setError('The passwords do not match.'); return }
    setBusy(true); setError('')
    try { await completePasswordReset(search.get('token') ?? '', password); setDone(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to reset this password') }
    finally { setBusy(false) }
  }
  return <AccountCard title="Choose a new password"><p className="auth-intro">Create a new password for your Acadex account.</p>{error && <Alert type="error" showIcon message={error}/>} {done ? <><Alert type="success" showIcon message="Password updated" description="You can now sign in with your new password."/><Link to="/login" className="create-account">Continue to sign in <ArrowRightOutlined/></Link></> : <div className="auth-form"><label>New password</label><Input.Password value={password} onChange={event => setPassword(event.target.value)} prefix={<LockOutlined/>} autoComplete="new-password" placeholder="At least 12 characters"/><label>Confirm password</label><Input.Password value={confirmation} onChange={event => setConfirmation(event.target.value)} prefix={<LockOutlined/>} autoComplete="new-password" placeholder="Repeat your password"/><Button type="primary" loading={busy} onClick={() => void submit()} className="auth-submit">Update password <ArrowRightOutlined/></Button></div>}</AccountCard>
}

export function VerifyEmailPage() {
  const [search] = useSearchParams()
  const token = search.get('token')
  const initialEmail = search.get('email')
  const [status, setStatus] = useState<'loading'|'done'|'error'>('loading')
  const [error, setError] = useState('')
  const [email, setEmail] = useState(search.get('email') ?? '')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!token) {
      if (initialEmail) { setError('We sent a verification link to your email. Open it to activate your account.'); setStatus('done') }
      else { setError('This verification link is missing its token.'); setStatus('error') }
      return
    }
    void confirmEmail(token).then(() => setStatus('done')).catch(reason => { setError(reason instanceof Error ? reason.message : 'Unable to verify this email'); setStatus('error') })
  }, [token, initialEmail])
  const resend = async () => {
    setBusy(true)
    try { await resendEmailVerification(email.trim().toLowerCase()); setStatus('done'); setError('A fresh verification link has been sent if your account needs one.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to request another link') }
    finally { setBusy(false) }
  }
  return <AccountCard title={status === 'loading' ? 'Verifying your email' : status === 'done' && !error ? 'Email verified' : status === 'done' ? 'Check your email' : 'Verification link expired'}>{status === 'loading' ? <p className="auth-intro">Please wait while we verify your account.</p> : <>{error && <Alert type={status === 'error' ? 'error' : 'success'} showIcon message={error}/>}<p className="auth-intro">{status === 'done' && !error ? 'Your email is verified. You can now sign in.' : status === 'done' ? 'Open the link in your inbox to verify your account.' : 'Request a fresh verification link to continue.'}</p>{status === 'error' && <div className="auth-form"><label>Email address</label><Input type="email" value={email} onChange={event => setEmail(event.target.value)} prefix={<MailOutlined/>}/><Button type="primary" loading={busy} disabled={!email.includes('@')} onClick={() => void resend()} className="auth-submit">Resend verification link</Button></div>}{status === 'done' && !error && <Link to="/login" className="create-account">Continue to sign in <ArrowRightOutlined/></Link>}</>}</AccountCard>
}
