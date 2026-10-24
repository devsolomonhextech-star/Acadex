import { apiRequest } from '../../shared/api/client'
import type {
  FeeCategory, FeeStructure, FinanceSummary, GenerateInvoicesResult, InvoiceDetail, InvoicePage,
  InvoiceStatus, Payment, PaymentMethod, PaymentPage,
} from '../../shared/api/types'

export function fetchFeeCategories(token: string) {
  return apiRequest<FeeCategory[]>('/finance/fee-categories', {}, token)
}

export function createFeeCategory(token: string, name: string) {
  return apiRequest<FeeCategory>('/finance/fee-categories', { method: 'POST', body: JSON.stringify({ name }) }, token)
}

export function fetchFeeStructures(token: string) {
  return apiRequest<FeeStructure[]>('/finance/fee-structures', {}, token)
}

export function createFeeStructure(token: string, payload: {
  fee_category_id: string; class_group_id: string; term_id: string; amount: string
}) {
  return apiRequest<FeeStructure>('/finance/fee-structures', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function archiveFeeStructure(token: string, structureId: string) {
  return apiRequest<FeeStructure>(
    `/finance/fee-structures/${structureId}`, { method: 'PATCH', body: JSON.stringify({ status: 'archived' }) }, token,
  )
}

export function generateInvoices(token: string, payload: { class_group_id: string; term_id: string }) {
  return apiRequest<GenerateInvoicesResult>(
    '/finance/invoices/generate', { method: 'POST', body: JSON.stringify(payload) }, token,
  )
}

export function fetchInvoices(token: string, params: {
  page: number; term_id?: string; status?: InvoiceStatus; search?: string
}) {
  const query = new URLSearchParams({ page: String(params.page), page_size: '10' })
  if (params.term_id) query.set('term_id', params.term_id)
  if (params.status) query.set('status', params.status)
  if (params.search?.trim()) query.set('search', params.search.trim())
  return apiRequest<InvoicePage>(`/finance/invoices?${query}`, {}, token)
}

export function fetchInvoiceDetail(token: string, invoiceId: string) {
  return apiRequest<InvoiceDetail>(`/finance/invoices/${invoiceId}`, {}, token)
}

export function fetchPayments(token: string, page: number) {
  return apiRequest<PaymentPage>(`/finance/payments?page=${page}&page_size=10`, {}, token)
}

export function createPayment(token: string, payload: {
  student_id: string; amount: string; method: PaymentMethod
  payment_date: string; reference?: string; note?: string
}) {
  return apiRequest<Payment>('/finance/payments', { method: 'POST', body: JSON.stringify(payload) }, token)
}

export function fetchFinanceSummary(token: string, termId?: string) {
  const query = termId ? `?term_id=${termId}` : ''
  return apiRequest<FinanceSummary>(`/finance/summary${query}`, {}, token)
}
