import type { SchoolUser, Session } from './types'

const apiBase = import.meta.env.VITE_API_URL ?? ''

export function readCsrfCookie(): string {
  return document.cookie.split('; ').find(part => part.startsWith('schoolos_csrf='))?.split('=').slice(1).join('=') ?? ''
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(options.headers)
  const isFormData = options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${apiBase}/api/v1${path}`, { ...options, headers, credentials: 'include' })
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) message = body.detail
    } catch { /* Preserve the status message for non-JSON responses. */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function apiRequestBlob(path: string, accessToken: string): Promise<Blob> {
  const response = await fetch(`${apiBase}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  })
  if (!response.ok) {
    let message = `Download failed (${response.status})`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) message = body.detail
    } catch { /* Preserve the status message for non-JSON responses. */ }
    throw new Error(message)
  }
  return response.blob()
}

export function signIn(schoolSlug: string, email: string, password: string) {
  return apiRequest<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ school_slug: schoolSlug, email, password }) })
}

export function fetchCurrentUser(token: string) {
  return apiRequest<SchoolUser>('/auth/me', {}, token)
}

export function rotateSession() {
  const csrf = readCsrfCookie()
  if (!csrf) throw new Error('No refresh session')
  return apiRequest<Session>('/auth/refresh', { method: 'POST', headers: { 'X-CSRF-Token': csrf } })
}

export function signOutRequest() {
  const csrf = readCsrfCookie()
  return apiRequest<void>('/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } })
}

export function registerSchool(payload: {
  school_name: string
  school_slug: string
  administrator_name: string
  email: string
  password: string
}) {
  return apiRequest<{ school_id: string; school_slug: string; status: string; message: string }>(
    '/onboarding/schools', { method: 'POST', body: JSON.stringify(payload) },
  )
}
