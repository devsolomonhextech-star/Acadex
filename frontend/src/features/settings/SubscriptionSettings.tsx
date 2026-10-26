import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Empty, InputNumber, Progress, Skeleton, Table, Tag, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ArrowRightOutlined, CheckCircleFilled, CreditCardOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/authHooks'
import { apiRequest } from '../../shared/api/client'
import { formatApiError } from '../../shared/api/errors'

type SubscriptionPayment = {
  reference: string
  student_limit: number
  amount_ghs: string
  status: 'pending' | 'paid' | 'failed'
  created_at: string
  paid_at: string | null
}

type SubscriptionStatus = {
  status: 'inactive' | 'active' | 'expired'
  active_students: number
  student_limit: number
  available_places: number
  price_per_student_ghs: string
  monthly_total_ghs: string
  current_period_start: string | null
  current_period_end: string | null
  payment_enabled: boolean
  recent_payments: SubscriptionPayment[]
}

type CheckoutResult = { checkout_url: string; reference: string; amount_ghs: string; student_limit: number }

const money = (amount: number | string) => `GH₵${Number(amount).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function SubscriptionSettings() {
  const { accessToken } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [capacity, setCapacity] = useState(50)
  const [toast, contextHolder] = message.useMessage()
  const reference = searchParams.get('reference')
  const subscription = useQuery({
    queryKey: ['school-subscription'],
    queryFn: () => apiRequest<SubscriptionStatus>('/subscription', {}, accessToken!),
    enabled: Boolean(accessToken),
  })

  useEffect(() => {
    if (!subscription.data) return
    setCapacity(current => Math.max(current, subscription.data.active_students, subscription.data.student_limit, 1))
  }, [subscription.data?.active_students, subscription.data?.student_limit])

  useEffect(() => {
    if (!reference || !accessToken) return
    let current = true
    void apiRequest<{ status: 'paid' | 'pending'; student_limit: number }>(
      '/subscription/verify', { method: 'POST', body: JSON.stringify({ reference }) }, accessToken,
    ).then(async result => {
      if (!current) return
      if (result.status === 'paid') {
        toast.success(`${result.student_limit} student places are now active.`)
        await queryClient.invalidateQueries({ queryKey: ['school-subscription'] })
      } else {
        toast.info('Payment is still processing. Your places will activate once it is confirmed.')
      }
    }).catch(error => {
      if (current) toast.error(formatApiError(error))
    }).finally(() => {
      if (!current) return
      const next = new URLSearchParams(searchParams)
      next.delete('reference')
      next.set('tab', 'billing')
      setSearchParams(next, { replace: true })
    })
    return () => { current = false }
  }, [reference, accessToken])

  const checkout = useMutation({
    mutationFn: () => apiRequest<CheckoutResult>(
      '/subscription/checkout',
      { method: 'POST', body: JSON.stringify({ student_limit: capacity }) },
      accessToken!,
    ),
    onSuccess: result => { window.location.assign(result.checkout_url) },
    onError: error => toast.error(formatApiError(error)),
  })

  const columns: ColumnsType<SubscriptionPayment> = useMemo(() => [
    { title: 'Date', dataIndex: 'created_at', width: 130, render: value => date(value) },
    { title: 'Student places', dataIndex: 'student_limit', width: 130 },
    { title: 'Amount', dataIndex: 'amount_ghs', width: 130, render: value => money(value) },
    { title: 'Status', dataIndex: 'status', render: value => <Tag color={value === 'paid' ? 'green' : value === 'pending' ? 'gold' : 'red'}>{value}</Tag> },
  ], [])

  if (subscription.isLoading) return <Card className="subscription-panel"><Skeleton active paragraph={{ rows: 6 }} /></Card>
  if (subscription.isError || !subscription.data) return <Card className="subscription-panel"><Alert type="error" showIcon message={formatApiError(subscription.error)} /></Card>

  const data = subscription.data
  const minimum = Math.max(1, data.active_students, data.status === 'active' ? data.student_limit : 1)
  const monthlyTotal = capacity * Number(data.price_per_student_ghs)

  return <div className="subscription-settings">
    {contextHolder}
    {!data.payment_enabled && <Alert type="warning" showIcon message="Online payments are being set up" description="Your administrator can review the plan here. Secure checkout will be available once Acadex payments are configured." />}
    <Card className="subscription-plan-card" bordered={false}>
      <div className="subscription-plan-copy">
        <div className="subscription-eyebrow"><CreditCardOutlined /> SCHOOL SUBSCRIPTION</div>
        <h2>One clear price. Room to grow.</h2>
        <p>Give your school the tools it needs, with a monthly student plan that scales to your institution.</p>
        <div className="subscription-price"><strong>GH₵3</strong><span>per student place<br />each month</span></div>
        <div className="subscription-secure"><SafetyCertificateOutlined /> Secure payment · Ghana cedi · Monthly billing</div>
      </div>
      <div className="subscription-plan-picker">
        <div className="subscription-current">
          <span>Current plan</span>
          <Tag color={data.status === 'active' ? 'green' : data.status === 'expired' ? 'orange' : 'default'}>{data.status === 'active' ? 'Active' : data.status === 'expired' ? 'Renewal due' : 'Not subscribed'}</Tag>
        </div>
        <label htmlFor="student-capacity">How many student places do you need?</label>
        <InputNumber id="student-capacity" min={minimum} max={100000} step={10} value={capacity} onChange={value => setCapacity(Math.max(minimum, value ?? minimum))} addonAfter="students" />
        <div className="subscription-total"><span>Monthly total</span><strong>{money(monthlyTotal)}<small> / month</small></strong></div>
        <Button type="primary" size="large" block icon={<CreditCardOutlined />} disabled={!data.payment_enabled || capacity < minimum} loading={checkout.isPending} onClick={() => checkout.mutate()}>
          {data.status === 'active' ? 'Renew or add student places' : 'Choose plan and pay'}
        </Button>
        <p className="subscription-plan-footnote">Your student places activate when payment is confirmed. Renew monthly from this page and increase capacity as your school grows.</p>
      </div>
    </Card>

    <div className="subscription-usage-grid">
      <Card className="subscription-usage-card" bordered={false}>
        <div className="subscription-card-title"><div><h3>Student places</h3><p>Your current roster against the plan</p></div><span className="subscription-usage-icon"><CheckCircleFilled /></span></div>
        <div className="subscription-usage-count"><strong>{data.active_students}</strong><span>of {data.student_limit} places</span></div>
        <Progress percent={data.student_limit ? Math.min(100, Math.round(data.active_students / data.student_limit * 100)) : 0} showInfo={false} strokeColor="#3563e9" trailColor="#eaf0ff" />
        <div className="subscription-usage-foot"><span>{data.available_places} places available</span><span>{data.student_limit ? `${Math.round(data.active_students / data.student_limit * 100)}% used` : 'Choose a plan to begin'}</span></div>
      </Card>
      <Card className="subscription-usage-card subscription-renewal-card" bordered={false}>
        <span className="subscription-eyebrow">BILLING PERIOD</span>
        <h3>{data.status === 'active' ? 'Your school is covered' : 'Activate before enrolling'}</h3>
        <p>{data.status === 'active' ? `Current access runs through ${date(data.current_period_end)}.` : 'Choose the number of student places you need. New student enrollment opens as soon as payment is confirmed.'}</p>
        {data.status === 'active' && <div className="subscription-period-line"><span>Next renewal</span><strong>{date(data.current_period_end)}</strong></div>}
        <div className="subscription-renewal-note"><ArrowRightOutlined /> Student records stay available if a plan expires; adding or reactivating students requires an active plan.</div>
      </Card>
    </div>

    <Card title="Recent subscription payments" className="subscription-history" bordered={false}>
      {data.recent_payments.length
        ? <Table<SubscriptionPayment> rowKey="reference" columns={columns} dataSource={data.recent_payments} pagination={false} size="small" scroll={{ x: 480 }} />
        : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Your payment history will appear here." />}
    </Card>
  </div>
}
