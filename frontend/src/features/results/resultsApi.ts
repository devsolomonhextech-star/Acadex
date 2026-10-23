import { apiRequest } from '../../shared/api/client'
import type { ClassResults, GradingScale } from '../../shared/api/types'

export function fetchGradingScales(token: string) {
  return apiRequest<GradingScale[]>('/grading/scales', {}, token)
}

export function saveGradingScale(
  token: string,
  payload: {
    name: string; is_default: boolean; include_positions: boolean
    bands: { min_percent: string; max_percent: string; grade: string; points: string | null; description: string | null }[]
  },
  scaleId?: string,
) {
  return apiRequest<GradingScale>(scaleId ? `/grading/scales/${scaleId}` : '/grading/scales', {
    method: scaleId ? 'PUT' : 'POST', body: JSON.stringify(payload),
  }, token)
}

export function archiveGradingScale(token: string, scaleId: string) {
  return apiRequest<void>(`/grading/scales/${scaleId}`, { method: 'DELETE' }, token)
}

export function fetchClassResults(token: string, classGroupId: string, termId: string) {
  const query = new URLSearchParams({ class_group_id: classGroupId, term_id: termId })
  return apiRequest<ClassResults>(`/results/class?${query.toString()}`, {}, token)
}

export function computeClassResults(token: string, classGroupId: string, termId: string) {
  return apiRequest<ClassResults>('/results/compute', {
    method: 'POST', body: JSON.stringify({ class_group_id: classGroupId, term_id: termId }),
  }, token)
}

export function publishClassResults(token: string, classGroupId: string, termId: string, confirmClassName: string) {
  return apiRequest<ClassResults>('/results/publish', {
    method: 'POST',
    body: JSON.stringify({ class_group_id: classGroupId, term_id: termId, confirm_class_name: confirmClassName }),
  }, token)
}

export function withdrawClassResults(token: string, classGroupId: string, termId: string) {
  return apiRequest<ClassResults>('/results/withdraw', {
    method: 'POST', body: JSON.stringify({ class_group_id: classGroupId, term_id: termId }),
  }, token)
}
