import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Alert, Button, Card, Progress, Spin, Tag } from 'antd'
import { ArrowRightOutlined, CheckCircleFilled, ClockCircleOutlined, RocketOutlined } from '@ant-design/icons'
import { apiRequest } from '../../shared/api/client'
import { useAuth } from '../auth/authHooks'
import '../../shared/styles/school-setup.css'

type SetupStep = { id: string; title: string; description: string; to: string; count: number; target: number; complete: boolean }
type SetupProgress = { steps: SetupStep[]; completed: number; total: number; progress_percent: number; school_name: string }

export default function SchoolSetupPage() {
  const { accessToken } = useAuth()
  const navigate = useNavigate()
  const query = useQuery({
    queryKey: ['school-setup-progress'],
    queryFn: () => apiRequest<SetupProgress>('/onboarding/progress', {}, accessToken!),
    enabled: Boolean(accessToken),
    staleTime: 30_000,
  })
  const data = query.data
  return <main className="setup-page">
    <header className="setup-hero">
      <div className="setup-hero-icon"><RocketOutlined /></div>
      <div className="setup-hero-copy">
        <span className="setup-eyebrow">SCHOOL LAUNCHPAD</span>
        <h1>Set up {data?.school_name ?? 'your school'}</h1>
        <p>Follow these steps to bring your school onto Acadex. Your progress updates as you complete each area.</p>
      </div>
      <div className="setup-progress-block">
        <strong>{data?.completed ?? 0}<span>/{data?.total ?? 8}</span></strong>
        <small>steps complete</small>
      </div>
    </header>

    {data ? <Card className="setup-progress-card" bordered={false}>
      <div className="setup-progress-heading"><div><strong>Your setup progress</strong><span>{data.progress_percent}% complete</span></div><span>{data.completed} of {data.total} steps</span></div>
      <Progress percent={data.progress_percent} showInfo={false} strokeColor="#246BFD" trailColor="#E9EFF8" />
    </Card> : null}

    {query.isLoading ? <div className="setup-loading"><Spin size="large"/><span>Checking your school setup…</span></div> : null}
    {query.isError ? <Alert type="error" showIcon message="Setup progress is unavailable" description="Try again in a moment." action={<Button onClick={() => void query.refetch()}>Retry</Button>} /> : null}
    {data ? <section className="setup-steps" aria-label="School setup steps">{data.steps.map((step, index) => <Card key={step.id} className={`setup-step-card${step.complete ? ' is-complete' : ''}`} bordered={false}>
      <div className="setup-step-number">{step.complete ? <CheckCircleFilled /> : String(index + 1).padStart(2, '0')}</div>
      <div className="setup-step-copy"><div className="setup-step-title"><h2>{step.title}</h2>{step.complete ? <Tag color="success">Complete</Tag> : <Tag icon={<ClockCircleOutlined />}>To do</Tag>}</div><p>{step.description}</p></div>
      <Button className="setup-step-action" onClick={() => navigate(step.to)}>{step.complete ? 'Review' : step.id === 'review' ? 'Review setup' : 'Continue'} <ArrowRightOutlined /></Button>
    </Card>)}</section> : null}
    {data?.progress_percent === 100 ? <Alert className="setup-finish" type="success" showIcon message="Your setup is complete" description="Your core school records and settings are ready. You can return here any time to review them." /> : null}
  </main>
}
