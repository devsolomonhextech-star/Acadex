import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import {
  Alert, AutoComplete, Button, DatePicker, Drawer, Empty, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag,
} from 'antd'
import type { TableColumnsType } from 'antd'
import {
  BarChartOutlined, CheckCircleOutlined, CreditCardOutlined, FileTextOutlined, PlusOutlined,
  SearchOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveFeeStructure, createFeeCategory, createFeeStructure, createPayment, fetchFeeCategories,
  fetchFeeStructures, fetchFinanceSummary, fetchInvoiceDetail, fetchInvoices, fetchPayments, generateInvoices,
} from './financeApi'
import { fetchClassGroups } from '../academic/academicApi'
import { fetchStudentOptions } from '../students/studentsApi'
import type {
  FeeStructure, GenerateInvoicesResult, InvoiceStatus, Payment, PaymentMethod,
} from '../../shared/api/types'
import { useAuth } from '../auth/authHooks'
import { useAcademicPeriod } from '../../shared/academic/AcademicPeriodContext'
import { formatApiError } from '../../shared/api/errors'

const amountSchema = z.string()
  .regex(/^\d+(\.\d{1,2})$/, 'Enter an amount like 250.00')
  .refine(value => /[1-9]/.test(value), 'Amount must be greater than zero')

const structureSchema = z.object({
  category: z.string().trim().min(1, 'Enter or choose a fee category').max(80, 'Maximum 80 characters'),
  class_group_id: z.string().min(1, 'Choose a class'),
  term_id: z.string().min(1, 'Choose a term'),
  amount: amountSchema,
})
type StructureValues = z.infer<typeof structureSchema>

const paymentSchema = z.object({
  student_id: z.string().min(1, 'Choose a student'),
  amount: amountSchema,
  method: z.enum(['cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other']),
  payment_date: z.string().min(1, 'Choose a date'),
  reference: z.string().trim().max(80, 'Maximum 80 characters').optional(),
  note: z.string().trim().max(255, 'Maximum 255 characters').optional(),
})
type PaymentValues = z.infer<typeof paymentSchema>

const invoiceStatusColors: Record<InvoiceStatus, string> = {
  issued: 'blue', partially_paid: 'orange', paid: 'green', void: 'default',
}
const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  issued: 'Issued', partially_paid: 'Partially paid', paid: 'Paid', void: 'Void',
}
const methodLabels: Record<PaymentMethod, string> = {
  cash: 'Cash', mobile_money: 'Mobile money', bank_transfer: 'Bank transfer',
  card: 'Card', cheque: 'Cheque', other: 'Other',
}

function money(value: string): string {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function FinancePage() {
  const { accessToken, user } = useAuth()
  const { terms, yearId: activeYearId, termId, year: activeYear, loading: periodLoading } = useAcademicPeriod()
  const queryClient = useQueryClient()
  const token = accessToken!

  const [invoicePage, setInvoicePage] = useState(1)
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | 'all'>('all')
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [paymentPage, setPaymentPage] = useState(1)
  const [activeFinanceTab, setActiveFinanceTab] = useState('overview')
  const [drawerInvoiceId, setDrawerInvoiceId] = useState<string | null>(null)
  const [structureOpen, setStructureOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [pageError, setPageError] = useState('')
  const [structureError, setStructureError] = useState('')
  const [generateError, setGenerateError] = useState('')
  const [paymentError, setPaymentError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(invoiceSearch), 250)
    return () => window.clearTimeout(timer)
  }, [invoiceSearch])
  useEffect(() => {
    setInvoicePage(1)
    setPaymentPage(1)
    setDrawerInvoiceId(null)
  }, [termId])

  const classes = useQuery({
    queryKey: ['academic', 'classes', activeYearId],
    queryFn: () => fetchClassGroups(token, activeYearId),
    enabled: Boolean(activeYearId && !periodLoading),
  })
  const students = useQuery({
    queryKey: ['students', 'options', user?.school_id],
    queryFn: () => fetchStudentOptions(token),
    enabled: Boolean(user),
  })
  const summary = useQuery({
    queryKey: ['finance', 'summary', user?.school_id, termId],
    queryFn: () => fetchFinanceSummary(token, termId || undefined),
    enabled: Boolean(user && !periodLoading),
  })
  const invoices = useQuery({
    queryKey: ['finance', 'invoices', user?.school_id, invoicePage, invoiceStatus, activeSearch, termId],
    queryFn: () => fetchInvoices(token, {
      page: invoicePage,
      term_id: termId || undefined,
      status: invoiceStatus === 'all' ? undefined : invoiceStatus,
      search: activeSearch,
    }),
    enabled: Boolean(user && !periodLoading),
  })
  const overviewInvoices = useQuery({
    queryKey: ['finance', 'overview-invoices', user?.school_id, termId],
    queryFn: () => fetchInvoices(token, { page: 1, term_id: termId || undefined }),
    enabled: Boolean(user && !periodLoading),
  })
  const payments = useQuery({
    queryKey: ['finance', 'payments', user?.school_id, paymentPage, termId],
    queryFn: () => fetchPayments(token, paymentPage, termId || undefined),
    enabled: Boolean(user && !periodLoading),
  })
  const feeStructures = useQuery({
    queryKey: ['finance', 'fee-structures', user?.school_id],
    queryFn: () => fetchFeeStructures(token),
    enabled: Boolean(user),
  })
  const feeCategories = useQuery({
    queryKey: ['finance', 'fee-categories', user?.school_id],
    queryFn: () => fetchFeeCategories(token),
    enabled: Boolean(user),
  })
  const invoiceDetail = useQuery({
    queryKey: ['finance', 'invoice', drawerInvoiceId],
    queryFn: () => fetchInvoiceDetail(token, drawerInvoiceId!),
    enabled: Boolean(drawerInvoiceId),
  })

  const invalidateFinance = async () => {
    await queryClient.invalidateQueries({ queryKey: ['finance'] })
  }
  const archiveStructure = useMutation({
    mutationFn: (structureId: string) => archiveFeeStructure(token, structureId),
    onSuccess: invalidateFinance,
    onError: error => setPageError(formatApiError(error)),
  })
  const structureForm = useForm<StructureValues>({
    resolver: zodResolver(structureSchema),
    defaultValues: { category: '', class_group_id: '', term_id: '', amount: '' },
  })
  const saveStructure = useMutation({
    mutationFn: async (values: StructureValues) => {
      const existing = feeCategories.data?.find(
        category => category.name.toLowerCase() === values.category.trim().toLowerCase(),
      )
      const category = existing ?? await createFeeCategory(token, values.category.trim())
      return createFeeStructure(token, {
        fee_category_id: category.id,
        class_group_id: values.class_group_id,
        term_id: values.term_id,
        amount: values.amount,
      })
    },
    onSuccess: async () => {
      setStructureOpen(false)
      setStructureError('')
      structureForm.reset()
      await queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
    onError: error => setStructureError(formatApiError(error)),
  })
  const [generateClassId, setGenerateClassId] = useState('')
  const [generateTermId, setGenerateTermId] = useState('')
  const [generateResult, setGenerateResult] = useState<GenerateInvoicesResult | null>(null)
  const generate = useMutation({
    mutationFn: () => generateInvoices(token, { class_group_id: generateClassId, term_id: generateTermId }),
    onSuccess: async result => {
      setGenerateError('')
      setGenerateResult(result)
      await invalidateFinance()
    },
    onError: error => setGenerateError(formatApiError(error)),
  })
  const paymentForm = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      student_id: '', amount: '', method: 'cash',
      payment_date: dayjs().format('YYYY-MM-DD'), reference: '', note: '',
    },
  })
  const [paymentResult, setPaymentResult] = useState<Payment | null>(null)
  const savePayment = useMutation({
    mutationFn: (values: PaymentValues) => createPayment(token, {
      student_id: values.student_id,
      amount: values.amount,
      method: values.method,
      payment_date: values.payment_date,
      ...(values.reference ? { reference: values.reference } : {}),
      ...(values.note ? { note: values.note } : {}),
    }),
    onSuccess: async payment => {
      setPaymentError('')
      setPaymentResult(payment)
      paymentForm.reset({
        student_id: '', amount: '', method: 'cash',
        payment_date: dayjs().format('YYYY-MM-DD'), reference: '', note: '',
      })
      await invalidateFinance()
    },
    onError: error => setPaymentError(formatApiError(error)),
  })

  const classOptions = (classes.data ?? []).map(group => ({ value: group.id, label: group.name }))
  const termSelectOptions = terms.map(term => ({ value: term.id, label: term.name }))
  const studentOptions = (students.data?.items ?? []).map(student => ({
    value: student.id,
    label: `${student.first_name} ${student.last_name} (${student.admission_number})`,
  }))
  const categoryOptions = (feeCategories.data ?? []).map(category => ({ value: category.name }))
  const collectionRate = summary.data && Number(summary.data.invoiced_total) > 0
    ? Math.min(100, Math.round(Number(summary.data.paid_total) / Number(summary.data.invoiced_total) * 100))
    : 0

  const invoiceColumns: TableColumnsType<Awaited<ReturnType<typeof fetchInvoices>>['items'][number]> = [
    {
      title: 'INVOICE', dataIndex: 'invoice_number', key: 'invoice_number',
      render: (value: string) => <span className="finance-strong">{value}</span>,
    },
    {
      title: 'STUDENT', key: 'student',
      render: (_, item) => (
        <span className="finance-student-cell">
          <strong>{item.student_name}</strong>
          <small>{item.admission_number}</small>
        </span>
      ),
    },
    { title: 'CLASS', dataIndex: 'class_name', key: 'class_name', render: value => value ?? <span className="table-muted">—</span> },
    { title: 'TERM', dataIndex: 'term_name', key: 'term_name' },
    { title: 'TOTAL', dataIndex: 'total_amount', key: 'total_amount', align: 'right', render: value => money(value) },
    { title: 'PAID', dataIndex: 'paid_amount', key: 'paid_amount', align: 'right', render: value => money(value) },
    {
      title: 'BALANCE', dataIndex: 'balance', key: 'balance', align: 'right',
      render: value => <span className="finance-strong">{money(value)}</span>,
    },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status',
      render: (value: InvoiceStatus) => (
        <Tag color={invoiceStatusColors[value]} bordered={false} className="student-status">{invoiceStatusLabels[value]}</Tag>
      ),
    },
    { title: 'ISSUED', dataIndex: 'issued_on', key: 'issued_on', render: value => dayjs(value).format('D MMM YYYY') },
  ]

  const paymentColumns: TableColumnsType<Payment> = [
    { title: 'RECEIPT', dataIndex: 'receipt_number', key: 'receipt_number', render: value => <span className="finance-strong">{value}</span> },
    {
      title: 'STUDENT', dataIndex: 'student_name', key: 'student_name',
      render: (value: string, item) => (
        <span className="finance-student-cell"><strong>{value}</strong><small>{item.reference ?? '—'}</small></span>
      ),
    },
    { title: 'METHOD', dataIndex: 'method', key: 'method', render: (value: PaymentMethod) => methodLabels[value] },
    { title: 'AMOUNT', dataIndex: 'amount', key: 'amount', align: 'right', render: value => <span className="finance-strong">{money(value)}</span> },
    {
      title: 'APPLIED TO INVOICES', key: 'applied', align: 'right',
      render: (_, item) => (
        <Space size={4}>
          <span>{money(item.allocated_amount)}</span>
          {Number(item.unallocated_amount) > 0 && (
            <Tag color="orange" bordered={false} className="student-status">+{money(item.unallocated_amount)} credit</Tag>
          )}
        </Space>
      ),
    },
    { title: 'DATE', dataIndex: 'payment_date', key: 'payment_date', render: value => dayjs(value).format('D MMM YYYY') },
  ]

  const structureColumns: TableColumnsType<FeeStructure> = [
    { title: 'FEE', dataIndex: 'category_name', key: 'category_name', render: value => <span className="finance-strong">{value}</span> },
    { title: 'CLASS', dataIndex: 'class_name', key: 'class_name' },
    { title: 'TERM', dataIndex: 'term_name', key: 'term_name' },
    { title: 'AMOUNT', dataIndex: 'amount', key: 'amount', align: 'right', render: value => <span className="finance-strong">{money(value)}</span> },
    {
      title: 'STATUS', dataIndex: 'status', key: 'status',
      render: (value: FeeStructure['status']) => (
        <Tag color={value === 'active' ? 'green' : 'default'} bordered={false} className="student-status">{value}</Tag>
      ),
    },
    {
      title: '', key: 'actions', width: 110, align: 'right',
      render: (_, item) => item.status === 'active' ? (
        <Popconfirm title="Archive this fee structure?" description="New invoices will no longer include it."
          okText="Archive" cancelText="Cancel" onConfirm={() => archiveStructure.mutate(item.id)}>
          <Button type="text" size="small" danger disabled={archiveStructure.isPending}>Archive</Button>
        </Popconfirm>
      ) : null,
    },
  ]

  const invoicesTab = (
    <div className="finance-tab">
      <div className="finance-toolbar">
        <div><h2>Invoices</h2><p>Billed fees per student, with balances updated as payments arrive</p></div>
        <Space size={8} wrap>
          <Select aria-label="Invoice status filter" value={invoiceStatus} className="student-filter"
            options={[
              { value: 'all', label: 'All statuses' },
              ...(Object.keys(invoiceStatusLabels) as InvoiceStatus[]).map(value => ({ value, label: invoiceStatusLabels[value] })),
            ]}
            onChange={value => { setInvoiceStatus(value); setInvoicePage(1) }}/>
          <Input allowClear prefix={<SearchOutlined/>} placeholder="Search student or invoice" value={invoiceSearch}
            onChange={event => { setInvoiceSearch(event.target.value); setInvoicePage(1) }} className="student-search"/>
        </Space>
      </div>
      {invoices.isError && <Alert className="import-alert" type="error" showIcon message={formatApiError(invoices.error)}/>}
      <Table<Awaited<ReturnType<typeof fetchInvoices>>['items'][number]>
        rowKey="id" columns={invoiceColumns} dataSource={invoices.data?.items ?? []} loading={invoices.isLoading}
        onRow={record => ({ onClick: () => setDrawerInvoiceId(record.id), className: 'finance-clickable-row' })}
        pagination={{
          current: invoicePage, pageSize: 10, total: invoices.data?.total ?? 0,
          onChange: setInvoicePage, showSizeChanger: false,
          showTotal: total => `${total} invoice${total === 1 ? '' : 's'}`,
        }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No invoices yet — generate them from the Fee structures tab"/> }}
      />
    </div>
  )

  const paymentsTab = (
    <div className="finance-tab">
      <div className="finance-toolbar">
        <div><h2>Payments</h2><p>Receipts are numbered automatically; allocations apply to the oldest invoices first</p></div>
        <Space size={8}>
          <Button type="primary" icon={<PlusOutlined/>} disabled={!studentOptions.length}
            onClick={() => {
              setPaymentError('')
              setPaymentResult(null)
              paymentForm.reset({ student_id: '', amount: '', method: 'cash', payment_date: dayjs().format('YYYY-MM-DD'), reference: '', note: '' })
              setPaymentOpen(true)
            }}>
            Record payment
          </Button>
        </Space>
      </div>
      {payments.isError && <Alert className="import-alert" type="error" showIcon message={formatApiError(payments.error)}/>}
      <Table<Payment>
        rowKey="id" columns={paymentColumns} dataSource={payments.data?.items ?? []} loading={payments.isLoading}
        pagination={{
          current: paymentPage, pageSize: 10, total: payments.data?.total ?? 0,
          onChange: setPaymentPage, showSizeChanger: false,
          showTotal: total => `${total} payment${total === 1 ? '' : 's'}`,
        }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet"/> }}
      />
    </div>
  )

  const structuresTab = (
    <div className="finance-tab">
      <div className="finance-toolbar">
        <div><h2>Fee structures</h2><p>What each class is billed each term — then generate invoices for the whole class</p></div>
        <Space size={8} wrap>
          <Button icon={<ThunderboltOutlined/>} disabled={!activeYear || !classOptions.length || !termSelectOptions.length}
          onClick={() => { setGenerateError(''); setGenerateResult(null); setGenerateClassId(''); setGenerateTermId(termId); setGenerateOpen(true) }}>
            Generate invoices
          </Button>
          <Button type="primary" icon={<PlusOutlined/>} disabled={!activeYear || !classOptions.length || !termSelectOptions.length}
          onClick={() => { setStructureError(''); structureForm.reset({ category: '', class_group_id: '', term_id: termId, amount: '' }); setStructureOpen(true) }}>
            Add fee structure
          </Button>
        </Space>
      </div>
      {feeStructures.isError && <Alert className="import-alert" type="error" showIcon message={formatApiError(feeStructures.error)}/>}
      {!activeYear && <Alert className="import-alert" type="info" showIcon message="Set up an academic year, term, and class first — fees are billed per class and term."/>}
      <Table<FeeStructure>
        rowKey="id" columns={structureColumns} dataSource={(feeStructures.data ?? []).filter(structure => !termId || structure.term_id === termId)} loading={feeStructures.isLoading || periodLoading}
        pagination={{ pageSize: 10, showSizeChanger: false }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No fee structures yet"/> }}
      />
    </div>
  )

  const overviewTab = (
    <div className="finance-overview">
      <div className="finance-overview-main">
        <section className="finance-overview-card finance-collection-card">
          <div className="finance-overview-title">
            <div><h2>Collection overview</h2><p>Payments received against issued invoices</p></div>
            <span className="finance-overview-icon"><BarChartOutlined/></span>
          </div>
          <div className="finance-collection-total">
            <strong>GH₵ {summary.data ? money(summary.data.paid_total) : '—'}</strong>
            <span>{collectionRate}% collected</span>
          </div>
          <div className="finance-progress" role="progressbar" aria-label="Invoice collection progress" aria-valuenow={collectionRate} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${collectionRate}%` }}/>
          </div>
          <div className="finance-progress-labels">
            <span>Collected <strong>GH₵ {summary.data ? money(summary.data.paid_total) : '—'}</strong></span>
            <span>Remaining <strong>GH₵ {summary.data ? money(summary.data.outstanding_total) : '—'}</strong></span>
          </div>
        </section>

        <section className="finance-overview-card finance-activity-card">
          <div className="finance-overview-title">
            <div><h2>Recent payments</h2><p>Latest receipts applied to invoices in this term</p></div>
            <Button type="link" onClick={() => setActiveFinanceTab('payments')}>All payments →</Button>
          </div>
          {payments.isError
            ? <Alert type="error" showIcon message={formatApiError(payments.error)}/>
            : <Table<Payment> size="small" rowKey="id" columns={paymentColumns.slice(0, 4)} dataSource={(payments.data?.items ?? []).slice(0, 5)} loading={payments.isLoading}
                pagination={false} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments recorded yet"/> }}/>
          }
        </section>

        <section className="finance-overview-card finance-open-invoices">
          <div className="finance-overview-title">
            <div><h2>Outstanding invoices</h2><p>Recently issued invoices with a balance remaining</p></div>
            <Button type="link" onClick={() => setActiveFinanceTab('invoices')}>All invoices →</Button>
          </div>
          {overviewInvoices.isError
            ? <Alert type="error" showIcon message={formatApiError(overviewInvoices.error)}/>
            : <Table<Awaited<ReturnType<typeof fetchInvoices>>['items'][number]> size="small" rowKey="id"
                columns={[
                  { title: 'STUDENT', key: 'student', render: (_, item) => <span className="finance-student-cell"><strong>{item.student_name}</strong><small>{item.class_name ?? item.admission_number}</small></span> },
                  { title: 'INVOICE', dataIndex: 'invoice_number', key: 'invoice_number' },
                  { title: 'BALANCE', dataIndex: 'balance', key: 'balance', align: 'right', render: value => <span className="finance-strong">GH₵ {money(value)}</span> },
                  { title: '', key: 'view', width: 68, render: (_, item) => <Button type="link" size="small" onClick={() => setDrawerInvoiceId(item.id)}>View</Button> },
                ]}
                dataSource={(overviewInvoices.data?.items ?? []).filter(item => Number(item.balance) > 0 && item.status !== 'void').slice(0, 5)}
                loading={overviewInvoices.isLoading} pagination={false}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No outstanding invoices"/> }}/>
          }
        </section>
      </div>

      <aside className="finance-overview-side">
        <section className="finance-overview-card finance-quick-actions">
          <div className="finance-overview-title"><div><h2>Quick actions</h2><p>Common finance tasks</p></div></div>
          <Button type="primary" icon={<PlusOutlined/>} block disabled={!studentOptions.length}
            onClick={() => { setPaymentError(''); setPaymentResult(null); paymentForm.reset({ student_id: '', amount: '', method: 'cash', payment_date: dayjs().format('YYYY-MM-DD'), reference: '', note: '' }); setPaymentOpen(true) }}>
            Record a payment
          </Button>
          <Button icon={<ThunderboltOutlined/>} block disabled={!activeYear || !classOptions.length || !termSelectOptions.length}
            onClick={() => { setGenerateError(''); setGenerateResult(null); setGenerateClassId(''); setGenerateTermId(termId); setGenerateOpen(true) }}>
            Generate invoices
          </Button>
          <Button icon={<FileTextOutlined/>} block disabled={!activeYear || !classOptions.length || !termSelectOptions.length}
            onClick={() => { setStructureError(''); structureForm.reset({ category: '', class_group_id: '', term_id: termId, amount: '' }); setStructureOpen(true) }}>
            Add fee structure
          </Button>
          <div className="finance-quick-note"><CreditCardOutlined/><span>Payments receive an automatic receipt and are applied to the oldest open invoices first.</span></div>
        </section>
        <section className="finance-overview-card finance-balance-card">
          <span className="finance-overview-icon"><CreditCardOutlined/></span>
          <span>Open invoices</span>
          <strong>{summary.data?.open_invoice_count ?? '—'}</strong>
          <small>Invoices with an outstanding balance</small>
        </section>
      </aside>
    </div>
  )

  return <div className="page-content finance-page">
    <div className="finance-heading">
      <div>
        <div className="eyebrow">MONEY <span className="live-dot"/> FEES & COLLECTION</div>
        <h1>Finance</h1>
        <p className="welcome-subtitle">Fee structures, invoices, and payments for {user?.school_name}.</p>
      </div>
      <div className="finance-heading-actions">
        <span className="finance-period-label">{activeYear?.name ?? 'Academic year'}{terms.find(term => term.id === termId) ? ` · ${terms.find(term => term.id === termId)!.name}` : ''}</span>
        <Button className="finance-primary-action" type="primary" icon={<PlusOutlined/>} disabled={!studentOptions.length}
          onClick={() => {
            setPaymentError('')
            setPaymentResult(null)
            paymentForm.reset({ student_id: '', amount: '', method: 'cash', payment_date: dayjs().format('YYYY-MM-DD'), reference: '', note: '' })
            setPaymentOpen(true)
          }}>
          Record payment
        </Button>
      </div>
    </div>

    <div className="finance-stats">
      <div className="finance-stat"><span>Invoiced (GH₵)</span><strong>{summary.data ? money(summary.data.invoiced_total) : '—'}</strong></div>
      <div className="finance-stat"><span>Collected (GH₵)</span><strong>{summary.data ? money(summary.data.paid_total) : '—'}</strong></div>
      <div className="finance-stat finance-stat-alert"><span>Outstanding (GH₵)</span><strong>{summary.data ? money(summary.data.outstanding_total) : '—'}</strong>
        <small>{summary.data ? `${summary.data.open_invoice_count} open invoice${summary.data.open_invoice_count === 1 ? '' : 's'}` : ''}</small></div>
      <div className="finance-stat"><span>Held credits (GH₵)</span><strong>{summary.data ? money(summary.data.credit_total) : '—'}</strong>
        <small>Payments not yet applied</small></div>
    </div>

    {pageError && <Alert className="import-alert" type="error" showIcon message={pageError} closable onClose={() => setPageError('')}/>}

    <section className="panel finance-panel">
      <Tabs activeKey={activeFinanceTab} onChange={setActiveFinanceTab} items={[
        { key: 'overview', label: <span><BarChartOutlined/> Overview</span>, children: overviewTab },
        { key: 'invoices', label: <span><CreditCardOutlined/> Invoices</span>, children: invoicesTab },
        { key: 'payments', label: <span><CheckCircleOutlined/> Payments</span>, children: paymentsTab },
        { key: 'structures', label: <span><CreditCardOutlined/> Fee structures</span>, children: structuresTab },
      ]}/>
    </section>

    <Drawer title={invoiceDetail.data ? `Invoice ${invoiceDetail.data.invoice_number}` : 'Invoice'} open={Boolean(drawerInvoiceId)}
      onClose={() => setDrawerInvoiceId(null)} width={520} destroyOnHidden>
      {!invoiceDetail.data
        ? <div className="finance-drawer-loading">Loading…</div>
        : <>
            <div className="drawer-student">
              <strong>{invoiceDetail.data.student_name}</strong>
              <span>{invoiceDetail.data.admission_number} · {invoiceDetail.data.class_name ?? 'No class'} · {invoiceDetail.data.term_name}</span>
              <Tag color={invoiceStatusColors[invoiceDetail.data.status]} bordered={false} className="student-status">
                {invoiceStatusLabels[invoiceDetail.data.status]}
              </Tag>
            </div>
            <div className="drawer-totals">
              <div><span>Total</span><strong>GH₵ {money(invoiceDetail.data.total_amount)}</strong></div>
              <div><span>Paid</span><strong>GH₵ {money(invoiceDetail.data.paid_amount)}</strong></div>
              <div><span>Balance</span><strong>GH₵ {money(invoiceDetail.data.balance)}</strong></div>
            </div>
            {Number(invoiceDetail.data.balance) > 0 && (
              <Button className="finance-drawer-pay" type="primary" icon={<PlusOutlined/>} block
                onClick={() => {
                  paymentForm.reset({
                    student_id: invoiceDetail.data!.student_id,
                    amount: invoiceDetail.data!.balance,
                    method: 'cash',
                    payment_date: dayjs().format('YYYY-MM-DD'),
                    reference: '',
                    note: `Payment for invoice ${invoiceDetail.data!.invoice_number}`,
                  })
                  setPaymentError('')
                  setPaymentResult(null)
                  setDrawerInvoiceId(null)
                  setPaymentOpen(true)
                }}>
                Record payment · GH₵ {money(invoiceDetail.data.balance)} due
              </Button>
            )}
            <h4 className="drawer-section-title">Fee lines</h4>
            <Table rowKey="id" size="small" pagination={false}
              dataSource={invoiceDetail.data.lines}
              columns={[
                { title: 'FEE', dataIndex: 'description', key: 'description' },
                { title: 'AMOUNT', dataIndex: 'amount', key: 'amount', align: 'right', render: value => money(value) },
              ]}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No lines"/> }}/>
            <h4 className="drawer-section-title">Payments applied</h4>
            <Table rowKey="id" size="small" pagination={false}
              dataSource={invoiceDetail.data.allocations}
              columns={[
                { title: 'RECEIPT', dataIndex: 'receipt_number', key: 'receipt_number' },
                { title: 'DATE', dataIndex: 'payment_date', key: 'payment_date', render: value => dayjs(value).format('D MMM YYYY') },
                { title: 'AMOUNT', dataIndex: 'amount', key: 'amount', align: 'right', render: value => money(value) },
              ]}
              locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No payments applied yet"/> }}/>
        </>}
    </Drawer>

    <Modal title="Add a fee structure" open={structureOpen} onCancel={() => setStructureOpen(false)} footer={null} destroyOnHidden>
      <p className="modal-intro">Define what students in a class pay for one term. You can then generate invoices for the whole class in one step.</p>
      {structureError && (
        <Alert className="import-alert" type="error" showIcon message={structureError}/>
      )}
      <form className="student-form" onSubmit={structureForm.handleSubmit(values => saveStructure.mutate(values))}>
        <label>Fee category</label>
        <Controller control={structureForm.control} name="category"
          render={({ field }) => <AutoComplete {...field} options={categoryOptions} placeholder="e.g. Tuition, Feeding, Uniform"
            onChange={value => field.onChange(value ?? '')}/>}/>
        {structureForm.formState.errors.category && <small>{structureForm.formState.errors.category.message}</small>}
        <div className="student-form-row">
          <div>
            <label>Class</label>
            <Controller control={structureForm.control} name="class_group_id"
              render={({ field }) => <Select {...field} options={classOptions} placeholder="Select class" showSearch
                optionFilterProp="label"/>}/>
            {structureForm.formState.errors.class_group_id && <small>{structureForm.formState.errors.class_group_id.message}</small>}
          </div>
          <div>
            <label>Term</label>
            <Controller control={structureForm.control} name="term_id"
              render={({ field }) => <Select {...field} options={termSelectOptions} placeholder="Select term"/>}/>
            {structureForm.formState.errors.term_id && <small>{structureForm.formState.errors.term_id.message}</small>}
          </div>
        </div>
        <label>Amount (GH₵)</label>
        <Controller control={structureForm.control} name="amount"
          render={({ field }) => <Input {...field} placeholder="e.g. 500.00" inputMode="decimal" autoComplete="off"/>}/>
        {structureForm.formState.errors.amount && <small>{structureForm.formState.errors.amount.message}</small>}
        <div className="student-form-actions">
          <Button onClick={() => setStructureOpen(false)}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={saveStructure.isPending}>Save structure</Button>
        </div>
      </form>
    </Modal>

    <Modal title="Generate invoices" open={generateOpen} onCancel={() => setGenerateOpen(false)} footer={null} destroyOnHidden>
      {generateResult
        ? <div className="import-done">
            <div className="import-done-icon"><CheckCircleOutlined/></div>
            <h3>{generateResult.created} invoice{generateResult.created === 1 ? '' : 's'} created</h3>
            <p>
              {generateResult.students} student{generateResult.students === 1 ? '' : 's'} considered,{' '}
              {generateResult.skipped} already billed for this term. Total billed GH₵ {money(generateResult.total_billed)}.
            </p>
            <div className="student-form-actions import-actions">
              <Button type="primary" onClick={() => { setGenerateOpen(false); setGenerateResult(null) }}>Done</Button>
            </div>
          </div>
        : <>
            <p className="modal-intro">
              Creates one invoice per actively enrolled student from every active fee structure for the chosen
              class and term. Students who already have an invoice for that term are skipped, so it is safe to re-run.
            </p>
            {generateError && (
              <Alert className="import-alert" type="error" showIcon message={generateError}/>
            )}
            <div className="student-form">
              <label>Class</label>
              <Select value={generateClassId || undefined} options={classOptions} placeholder="Select class"
                onChange={value => setGenerateClassId(value)} showSearch optionFilterProp="label"/>
              <label>Term</label>
              <Select value={generateTermId || undefined} options={termSelectOptions} placeholder="Select term"
                onChange={value => setGenerateTermId(value)}/>
              <div className="student-form-actions">
                <Button onClick={() => setGenerateOpen(false)}>Cancel</Button>
                <Button type="primary" icon={<ThunderboltOutlined/>} loading={generate.isPending}
                  disabled={!generateClassId || !generateTermId} onClick={() => generate.mutate()}>
                  Generate invoices
                </Button>
              </div>
            </div>
          </>}
    </Modal>

    <Modal title="Record a payment" open={paymentOpen} onCancel={() => setPaymentOpen(false)} footer={null} destroyOnHidden>
      {paymentResult
        ? <div className="import-done">
            <div className="import-done-icon"><CheckCircleOutlined/></div>
            <h3>Receipt {paymentResult.receipt_number}</h3>
            <p>
              GH₵ {money(paymentResult.amount)} recorded for {paymentResult.student_name}.{' '}
              {Number(paymentResult.unallocated_amount) > 0
                ? `GH₵ ${money(paymentResult.unallocated_amount)} is held as credit — no open invoices to apply it to.`
                : 'Applied to the oldest open invoices.'}
            </p>
            <div className="student-form-actions import-actions">
              <Button onClick={() => setPaymentResult(null)}>Record another</Button>
              <Button type="primary" onClick={() => setPaymentOpen(false)}>Done</Button>
            </div>
          </div>
        : <>
            <p className="modal-intro">
              Payments are recorded with a generated receipt number and applied to the student's oldest open
              invoices first. This records a received payment; provider confirmations are handled separately.
            </p>
            {paymentError && (
              <Alert className="import-alert" type="error" showIcon message={paymentError}/>
            )}
            <form className="student-form" onSubmit={paymentForm.handleSubmit(values => savePayment.mutate(values))}>
              <label>Student</label>
              <Controller control={paymentForm.control} name="student_id"
                render={({ field }) => <Select {...field} options={studentOptions} placeholder="Search student"
                  showSearch optionFilterProp="label" allowClear onChange={value => field.onChange(value ?? '')}/>}/>
              {paymentForm.formState.errors.student_id && <small>{paymentForm.formState.errors.student_id.message}</small>}
              <div className="student-form-row">
                <div>
                  <label>Amount (GH₵)</label>
                  <Controller control={paymentForm.control} name="amount"
                    render={({ field }) => <Input {...field} placeholder="e.g. 250.00" inputMode="decimal" autoComplete="off"/>}/>
                  {paymentForm.formState.errors.amount && <small>{paymentForm.formState.errors.amount.message}</small>}
                </div>
                <div>
                  <label>Method</label>
                  <Controller control={paymentForm.control} name="method"
                    render={({ field }) => <Select {...field} options={(Object.keys(methodLabels) as PaymentMethod[])
                      .map(value => ({ value, label: methodLabels[value] }))}/>}/>
                </div>
              </div>
              <div className="student-form-row">
                <div>
                  <label>Date</label>
                  <Controller control={paymentForm.control} name="payment_date"
                    render={({ field }) => <DatePicker className="student-date" format="DD MMM YYYY"
                      disabledDate={current => Boolean(current && current.isAfter(dayjs(), 'day'))}
                      value={field.value ? dayjs(field.value) : null}
                      onChange={value => field.onChange(value?.format('YYYY-MM-DD') ?? '')}/>}/>
                  {paymentForm.formState.errors.payment_date && <small>{paymentForm.formState.errors.payment_date.message}</small>}
                </div>
                <div>
                  <label>Reference <span className="optional-label">Optional</span></label>
                  <Controller control={paymentForm.control} name="reference"
                    render={({ field }) => <Input {...field} placeholder="e.g. MOMO-12345" autoComplete="off"/>}/>
                  {paymentForm.formState.errors.reference && <small>{paymentForm.formState.errors.reference.message}</small>}
                </div>
              </div>
              <label>Note <span className="optional-label">Optional</span></label>
              <Controller control={paymentForm.control} name="note"
                render={({ field }) => <Input {...field} placeholder="Any extra detail" autoComplete="off"/>}/>
              <div className="student-form-actions">
                <Button onClick={() => setPaymentOpen(false)}>Cancel</Button>
                <Button type="primary" htmlType="submit" loading={savePayment.isPending}>Record payment</Button>
              </div>
            </form>
          </>}
    </Modal>
  </div>
}
