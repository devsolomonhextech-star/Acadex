import { apiRequest } from '../../shared/api/client'
import type { Overview } from '../../shared/api/types'

export function fetchOverview(token: string) {
  return apiRequest<Overview>('/overview', {}, token)
}
