import { apiRequest } from '../../shared/api/client'
import type { DemoSeedResult, Overview } from '../../shared/api/types'

export function fetchOverview(token: string, yearId?: string, termId?: string) {
  const query = new URLSearchParams()
  if (yearId) query.set('academic_year_id', yearId)
  if (termId) query.set('term_id', termId)
  return apiRequest<Overview>(`/overview${query.size ? `?${query}` : ''}`, {}, token)
}

export function seedDemoFees(token: string) {
  return apiRequest<DemoSeedResult>('/overview/demo/seed', { method: 'POST' }, token)
}
