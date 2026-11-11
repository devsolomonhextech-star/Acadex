import { ApiRequestError } from '../../shared/api/client'
import { API_BASE_URL } from '../../shared/api/config'

export type PlatformAdmin = {
  id: string
  user_id: string
  email: string
  display_name: string
  role: 'superadmin' | 'support'
}

export type PlatformSession = {
  access_token: string | null
  expires_in: number | null
  csrf_token: string | null
  admin: PlatformAdmin
}

export type PlatformSchool = {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
  trial_ends_at: string | null
  student_count: number
  subscription_status: 'active' | 'inactive'
  student_limit: number
  admin_name: string | null
  admin_email: string | null
}

export type PlatformSchoolsPage = {
  items: PlatformSchool[]
  total: number
  limit: number
  offset: number
}

export type PlatformOverview = {
  schools_total: number
  schools_active: number
  schools_new_30_days: number
  students_total: number
  active_subscriptions: number
  licensed_students: number
  members_by_role: Record<string, number>
  recent_schools: PlatformSchool[]
  signups: { month: string; count: number }[]
}

async function consoleRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE_URL}/api/v1/platform${path}`, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: string | { message?: string; code?: string } }
      if (typeof body.detail === 'string') detail = body.detail
      else if (body.detail?.message) detail = body.detail.message
    } catch { /* Non-JSON error body. */ }
    throw new ApiRequestError(detail, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function readConsoleCsrf() {
  return document.cookie.split('; ').find(part => part.startsWith('acadex_platform_csrf='))?.split('=').slice(1).join('=') ?? ''
}

export function hasConsoleSession() {
  return Boolean(readConsoleCsrf())
}

export function consoleLogin(email: string, password: string) {
  return consoleRequest<PlatformSession>('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password }),
  })
}

export function refreshConsoleSession() {
  return consoleRequest<PlatformSession>('/auth/refresh', {
    method: 'POST', headers: { 'X-CSRF-Token': readConsoleCsrf() },
  })
}

export function consoleLogout() {
  return consoleRequest<void>('/auth/logout', {
    method: 'POST', headers: { 'X-CSRF-Token': readConsoleCsrf() },
  })
}

export function fetchConsoleMe(token: string) {
  return consoleRequest<PlatformAdmin>('/auth/me', {}, token)
}

export function fetchPlatformOverview(token: string) {
  return consoleRequest<PlatformOverview>('/overview', {}, token)
}

export function fetchPlatformSchools(token: string, params: {
  search?: string; status?: 'all' | 'active' | 'inactive'; limit?: number; offset?: number
}) {
  const query = new URLSearchParams()
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.status && params.status !== 'all') query.set('status', params.status)
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  const suffix = query.toString()
  return consoleRequest<PlatformSchoolsPage>(`/schools${suffix ? `?${suffix}` : ''}`, {}, token)
}

export function setPlatformSchoolStatus(token: string, schoolId: string, status: 'active' | 'inactive') {
  return consoleRequest<{ id: string; status: string }>(`/schools/${encodeURIComponent(schoolId)}/status`, {
    method: 'PATCH', body: JSON.stringify({ status }),
  }, token)
}
