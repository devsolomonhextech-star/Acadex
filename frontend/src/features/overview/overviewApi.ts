import { apiRequest } from '../../shared/api/client'
import type { DemoSeedResult, Overview } from '../../shared/api/types'

export function fetchOverview(token: string) {
  return apiRequest<Overview>('/overview', {}, token)
}

export function seedDemoFees(token: string) {
  return apiRequest<DemoSeedResult>('/overview/demo/seed', { method: 'POST' }, token)
}
