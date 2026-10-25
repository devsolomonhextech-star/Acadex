import { apiRequest } from '../../shared/api/client'

export type TotpSetup = { secret: string; otpauth_uri: string; qr_svg: string }

export function fetchTotpStatus(token: string) {
  return apiRequest<{ enabled: boolean }>('/auth/totp/status', {}, token)
}

export function beginTotpSetup(token: string) {
  return apiRequest<TotpSetup>('/auth/totp/setup', { method: 'POST' }, token)
}

export function enableTotp(token: string, code: string) {
  return apiRequest<{ enabled: boolean }>('/auth/totp/enable', { method: 'POST', body: JSON.stringify({ code }) }, token)
}

export function disableTotp(token: string, code: string) {
  return apiRequest<{ enabled: boolean }>('/auth/totp/disable', { method: 'POST', body: JSON.stringify({ code }) }, token)
}
