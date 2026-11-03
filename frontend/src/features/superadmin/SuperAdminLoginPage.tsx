import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Alert, Button, Input } from 'antd'
import { ArrowRightOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { formatApiError } from '../../shared/api/errors'
import { useSuperAdmin } from './SuperAdminAuth'

export default function SuperAdminLoginPage() {
  const navigate = useNavigate()
  const { admin, loading, signIn } = useSuperAdmin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!loading && admin) return <Navigate to="/superadmin" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your platform email and password.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await signIn(email.trim(), password)
      navigate('/superadmin', { replace: true })
    } catch (failure) {
      setError(formatApiError(failure))
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="sa-login">
    <aside className="sa-login-brand">
      <div className="sa-login-lockup">
        <span className="sa-mark"><SafetyCertificateOutlined/></span>
        <div><strong>Acadex</strong><small>Platform console</small></div>
      </div>
      <div className="sa-login-copy">
        <span className="sa-login-kicker">OPERATIONS · PLATFORM TEAM</span>
        <h1>Every school,<br/><em>one calm view.</em></h1>
        <p>Monitor the schools running on Acadex, their subscriptions, and the people behind them.</p>
      </div>
      <ul className="sa-login-points">
        <li><span/>School directory with administrators and enrolment</li>
        <li><span/>Subscription and licensing health</li>
        <li><span/>Restricted to Acadex platform staff</li>
      </ul>
      <div className="sa-login-footer">ACADEX INTERNAL · AUTHORIZED PERSONNEL ONLY</div>
    </aside>

    <main className="sa-login-main">
      <section className="sa-login-card">
        <div className="sa-login-mobile-lockup">
          <span className="sa-mark"><SafetyCertificateOutlined/></span>
          <strong>Acadex</strong>
        </div>
        <span className="sa-login-eyebrow">SUPERADMIN ACCESS</span>
        <h2>Sign in to the console</h2>
        <p className="sa-login-intro">Use your platform credentials. School administrator accounts cannot sign in here.</p>
        {error && <Alert type="error" showIcon message={error} className="sa-login-alert"/>}
        <form onSubmit={submit} className="sa-login-form">
          <label htmlFor="sa-email">Platform email</label>
          <Input
            id="sa-email" value={email} onChange={event => setEmail(event.target.value)}
            prefix={<MailOutlined/>} placeholder="you@acadex.app" autoComplete="username"
            size="large" autoFocus
          />
          <label htmlFor="sa-password">Password</label>
          <Input.Password
            id="sa-password" value={password} onChange={event => setPassword(event.target.value)}
            prefix={<LockOutlined/>} placeholder="Enter your password"
            autoComplete="current-password" size="large"
          />
          <Button htmlType="submit" type="primary" size="large" loading={submitting} block>
            Sign in to console <ArrowRightOutlined/>
          </Button>
        </form>
        <div className="sa-login-security"><SafetyCertificateOutlined/> Console sessions expire automatically and are separate from school logins.</div>
        <div className="sa-login-links">
          <Link to="/login">School sign-in</Link>
          <span>·</span>
          <Link to="/">Acadex home</Link>
        </div>
      </section>
      <footer className="sa-login-copyright">© 2026 Acadex <span>·</span> Platform operations</footer>
    </main>
  </div>
}
