import { apiRequest } from '../../shared/api/client'
import type {
  ParentRequestCounts, ParentRequestDetail, ParentRequestPage, ParentRequestStatus,
} from '../../shared/api/types'

type RequestQuery = { status?: string; search?: string; page?: number; pageSize?: number }

export function fetchParentRequests(token: string, query: RequestQuery = {}) {
  const params = new URLSearchParams({
    status: query.status && query.status !== 'all' ? query.status : 'all',
    page: String(query.page ?? 1),
    page_size: String(query.pageSize ?? 25),
  })
  if (query.search?.trim()) params.set('search', query.search.trim())
  return apiRequest<ParentRequestPage>(`/communications/requests?${params}`, {}, token)
}

/** The sidebar badge only needs the counts, so it asks for a single row. */
export async function fetchParentRequestCounts(token: string): Promise<ParentRequestCounts> {
  const result = await fetchParentRequests(token, { pageSize: 1 })
  return result.counts
}

export function fetchParentRequest(token: string, requestId: string) {
  return apiRequest<ParentRequestDetail>(`/communications/requests/${requestId}`, {}, token)
}

export function replyToParentRequest(token: string, requestId: string, body: string) {
  return apiRequest<ParentRequestDetail>(
    `/communications/requests/${requestId}/messages`,
    { method: 'POST', body: JSON.stringify({ body }) },
    token,
  )
}

export function setParentRequestStatus(token: string, requestId: string, status: ParentRequestStatus) {
  return apiRequest<ParentRequestDetail>(
    `/communications/requests/${requestId}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
    token,
  )
}
