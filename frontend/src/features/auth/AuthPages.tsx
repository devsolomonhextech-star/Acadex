import { useEffect, useState, type FormEvent } from 'react'
import type { ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Alert, Button, Input, Modal, Spin } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined, AppstoreOutlined, LockOutlined, MailOutlined, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { createSchool, useAuth } from './authHooks'
import { ApiRequestError } from '../../shared/api/client'

function formatLockoutTime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, '0')).join(':')
}

const emailSchema = z.string().email('Enter a valid email address')
const loginSchema = z.object({ school: z.string().min(3, 'Enter your school address'), email: emailSchema, password: z.string().min(1, 'Enter your password') })
type LoginValues = z.infer<typeof loginSchema>

function BrandPanel({ register = false }: { register?: boolean }) {
  return <aside className="auth-brand-panel"><Link to="/login" className="auth-brand"><span><AppstoreOutlined /></span> school<span className="auth-brand-accent">OS</span></Link><div className="brand-copy"><div className="brand-kicker">A BETTER SCHOOL DAY STARTS HERE</div><h1>{register ? 'Your school, all in one place.' : 'A clearer view of your school.'}</h1><p>Bring the everyday work of school life together, so your people can focus on what matters most.</p><div className="brand-proof"><span className="proof-icon"><SafetyCertificateOutlined /></span><span><strong>Built around your school</strong><small>Private workspaces for every institution</small></span></div></div><div className="brand-orbit orbit-one"/><div className="brand-orbit orbit-two"/><div className="brand-footer">MADE FOR THE PEOPLE WHO MAKE SCHOOLS WORK</div></aside>
}

export function LoginPage() {
  const { signInToSchool, completeTwoFactorSignIn } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null)
  const [challengeToken, setChallengeToken] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const { control, handleSubmit, formState: { errors } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema), defaultValues: { school: search.get('school') ?? '', email: search.get('email') ?? '', password: '' },
  })
  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return
    const timer = window.setInterval(() => setLockoutSeconds(value => value === null ? null : Math.max(0, value - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [lockoutSeconds])
  const submit = handleSubmit(async values => {
    setError('')
    setSubmitting(true)
    try {
      const result = await signInToSchool(values.school.trim().toLowerCase(), values.email.trim().toLowerCase(), values.password)
      if (result.requiresTwoFactor) setChallengeToken(result.challengeToken)
      else navigate('/', { replace: true })
    }
    catch (reason) {
      if (reason instanceof ApiRequestError && reason.code === 'login_locked') {
        setError('')
        setLockoutSeconds(reason.retryAfterSeconds ?? 8 * 60 * 60)
      } else setError(reason instanceof Error ? reason.message : 'Unable to sign in. Try again.')
    }
    finally { setSubmitting(false) }
  })

  const submitTotp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(verificationCode)) { setError('Enter the six-digit code from your authenticator app.'); return }
    setError('')
    setSubmitting(true)
    try { await completeTwoFactorSignIn(challengeToken, verificationCode); navigate('/', { replace: true }) }
    catch (reason) {
      if (reason instanceof ApiRequestError && reason.code === 'login_locked') {
        setError('')
        setLockoutSeconds(reason.retryAfterSeconds ?? 8 * 60 * 60)
      } else setError(reason instanceof Error ? reason.message : 'That code could not be verified. Try again.')
    }
    finally { setSubmitting(false) }
  }

  return <div className="auth-layout"><BrandPanel/><main className="auth-main"><div className="auth-mobile-brand"><AppstoreOutlined/> school<span>OS</span></div><section className="auth-card"><div className="auth-card-kicker">{challengeToken ? 'TWO-STEP VERIFICATION' : 'WELCOME BACK'}</div><h2>{challengeToken ? 'Check your authenticator' : 'Sign in to your school'}</h2><p className="auth-intro">{challengeToken ? 'Enter the six-digit code shown in Google Authenticator to finish signing in.' : 'Enter your school address and account details to continue.'}</p>{error && <Alert className="auth-alert" type="error" showIcon message={error}/>} {challengeToken ? <form onSubmit={submitTotp} className="auth-form"><label>Authentication code</label><Input value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={6} autoFocus/><Button htmlType="submit" type="primary" loading={submitting} className="auth-submit">Verify and sign in <ArrowRightOutlined/></Button><button type="button" className="quiet-link" onClick={() => { setChallengeToken(''); setVerificationCode(''); setError('') }}>Back to sign in</button></form> : <><form onSubmit={submit} className="auth-form"><label>School address</label><Controller control={control} name="school" render={({ field }) => <Input {...field} prefix={<AppstoreOutlined/>} placeholder="e.g. aburi-academy" autoComplete="organization" status={errors.school ? 'error' : undefined}/>} />{errors.school && <small className="field-error">{errors.school.message}</small>}<label>Email address</label><Controller control={control} name="email" render={({ field }) => <Input {...field} prefix={<MailOutlined/>} placeholder="you@school.edu.gh" autoComplete="username" status={errors.email ? 'error' : undefined}/>} />{errors.email && <small className="field-error">{errors.email.message}</small>}<div className="password-label"><label>Password</label><button type="button" className="quiet-link" disabled>Forgot password?</button></div><Controller control={control} name="password" render={({ field }) => <Input.Password {...field} prefix={<LockOutlined/>} placeholder="Enter your password" autoComplete="current-password" status={errors.password ? 'error' : undefined}/>} />{errors.password && <small className="field-error">{errors.password.message}</small>}<Button htmlType="submit" type="primary" loading={submitting} className="auth-submit">Sign in <ArrowRightOutlined/></Button></form><div className="auth-divider"><span>NEW TO SCHOOLOS?</span></div><Link to="/register" className="create-account">Set up your school account <ArrowRightOutlined/></Link></>}<div className="auth-security"><SafetyCertificateOutlined/> Your account is protected with secure sign-in</div></section><footer className="auth-footer">© 2026 SchoolOS <span>·</span> School operations, made clearer</footer>
    <Modal title="Sign-in temporarily locked" open={lockoutSeconds !== null} closable={false} maskClosable={false} keyboard={false} footer={lockoutSeconds === 0 ? <Button type="primary" onClick={() => setLockoutSeconds(null)}>Try again</Button> : null}>
      <div className="login-lockout-copy"><p>This network has had four unsuccessful sign-in attempts. For security, sign-in is blocked for eight hours.</p><span>You can try again in</span><strong>{formatLockoutTime(lockoutSeconds ?? 0)}</strong></div>
    </Modal>
    </main></div>
}

const registerSchema = z.object({
  school_name: z.string().trim().min(2, 'Enter the school name').max(160),
  school_slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens').min(3).max(80),
  administrator_name: z.string().trim().min(2, 'Enter your name').max(160),
  email: emailSchema,
  password: z.string().min(12, 'Use at least 12 characters').max(128),
})
type RegisterValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { control, handleSubmit, formState: { errors } } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })
  const submit = handleSubmit(async values => {
    setError('')
    setSubmitting(true)
    try {
      const result = await createSchool({ ...values, email: values.email.trim().toLowerCase(), school_slug: values.school_slug.trim().toLowerCase() })
      navigate(`/login?school=${encodeURIComponent(result.school_slug)}`, { replace: true })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to set up the school. Try again.') }
    finally { setSubmitting(false) }
  })
  const field = (name: keyof RegisterValues, label: string, placeholder: string, icon: ReactNode, type = 'text', autoComplete?: string) => <div className="register-field"><label>{label}</label><Controller control={control} name={name} render={({ field: input }) => <Input {...input} prefix={icon} placeholder={placeholder} type={type} autoComplete={autoComplete} status={errors[name] ? 'error' : undefined}/>} />{errors[name] && <small className="field-error">{errors[name]?.message}</small>}</div>
  return <div className="auth-layout"><BrandPanel register/><main className="auth-main register-main"><div className="auth-mobile-brand"><AppstoreOutlined/> school<span>OS</span></div><section className="auth-card register-card"><Link to="/login" className="back-link"><ArrowLeftOutlined/> Back to sign in</Link><div className="auth-card-kicker">GET STARTED</div><h2>Set up your school</h2><p className="auth-intro">Create a private workspace for your school and appoint its first administrator.</p>{error && <Alert className="auth-alert" type="error" showIcon message={error}/>}<form onSubmit={submit} className="auth-form register-form">{field('school_name','School name','e.g. Aburi Academy',<AppstoreOutlined/>)}<div className="register-field"><label>School address</label><Controller control={control} name="school_slug" render={({ field: input }) => <Input {...input} addonBefore="schoolos.app/" placeholder="aburi-academy" autoComplete="off" status={errors.school_slug ? 'error' : undefined}/>} />{errors.school_slug && <small className="field-error">{errors.school_slug.message}</small>}<small className="field-hint">Choose a unique address for your school workspace.</small></div>{field('administrator_name','Your name','Full name',<UserOutlined/>)}{field('email','Work email','you@school.edu.gh',<MailOutlined/>,'email','email')}{field('password','Create password','At least 12 characters',<LockOutlined/>,'password','new-password')}<Button htmlType="submit" type="primary" loading={submitting} className="auth-submit">Create school workspace <ArrowRightOutlined/></Button></form><div className="auth-security"><SafetyCertificateOutlined/> Your school’s data is kept in a separate workspace</div></section><footer className="auth-footer"><Link to="/login">Already have a school workspace? Sign in</Link></footer></main></div>
}

export function LoadingPage() { return <main className="auth-loading"><Spin size="large"/><span>Checking your school workspace…</span></main> }
