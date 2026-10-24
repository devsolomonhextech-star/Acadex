import type { SchoolUser, Session } from './types'

const apiBase = import.meta.env.VITE_API_URL ?? ''

type SessionRefresher = () => Promise<string | null>
let sessionRefresher: SessionRefresher | null = null

/** Registered by the auth provider so a 401 can mint a fresh access token once. */
export function setSessionRefresher(refresher: SessionRefresher | null) {
  sessionRefresher = refresher
}

export function readCsrfCookie(): string {
  return document.cookie.split('; ').find(part => part.startsWith('schoolos_csrf='))?.split('=').slice(1).join('=') ?? ''
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(options.headers)
  const isFormData = options.body instanceof FormData
  if (options.body && !isFormData && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)
  const response = await fetch(`${apiBase}/api/v1${path}`, { ...options, headers, credentials: 'include' })
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    const refreshed = await sessionRefresher?.()
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed}`)
      const retried = await fetch(`${apiBase}/api/v1${path}`, { ...options, headers, credentials: 'include' })
      return parseResponse<T>(retried, path)
    }
  }
  return parseResponse<T>(response, path)
}

async function parseResponse<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) message = body.detail
    } catch { /* Preserve the status message for non-JSON responses. */ }
    if (response.status === 401 && !path.startsWith('/auth/')) message = 'Your session has expired. Please sign in again.'
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function apiRequestBlob(path: string, accessToken: string): Promise<Blob> {
  const doFetch = (token: string) => fetch(`${apiBase}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  })
  let response = await doFetch(accessToken)
  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await sessionRefresher?.()
    if (refreshed) response = await doFetch(refreshed)
  }
  if (!response.ok) {
    let message = `Download failed (${response.status})`
    try {
      const body = await response.json() as { detail?: string }
      if (body.detail) message = body.detail
    } catch { /* Preserve the status message for non-JSON responses. */ }
    if (response.status === 401) message = 'Your session has expired. Please sign in again.'
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
