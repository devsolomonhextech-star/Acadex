import { apiRequest } from '../../shared/api/client'

export type TotpSetup = { secret: string; otpauth_uri: string; qr_svg: string }
export type SchoolContact = { phone: string | null }
export type AlertKey = 'attendance' | 'fees' | 'results' | 'parent_desk'
export type AlertSettings = {
  alerts: Record<AlertKey, boolean>
  categories: { key: AlertKey; label: string; description: string }[]
  can_edit: boolean
}

export function fetchAlertSettings(token: string) {
  return apiRequest<AlertSettings>('/school/alert-settings', {}, token)
}

export function updateAlertSettings(token: string, alerts: Record<AlertKey, boolean>) {
  return apiRequest<AlertSettings>('/school/alert-settings', { method: 'PUT', body: JSON.stringify(alerts) }, token)
}

export type DismissalDay = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
export type DismissalSettings = {
  enabled: boolean
  closing_times: Record<DismissalDay, string | null>
  reminder_enabled: boolean
  reminder_lead_minutes: number
  authorized_guardians_only: boolean
  late_pickup_after_minutes: number
}
export type DismissalSettingsResponse = {
  settings: DismissalSettings
  days: DismissalDay[]
  reminder_lead_choices: number[]
  can_edit: boolean
}

export function fetchDismissalSettings(token: string) {
  return apiRequest<DismissalSettingsResponse>('/school/dismissal-settings', {}, token)
}

export function updateDismissalSettings(token: string, settings: DismissalSettings) {
  return apiRequest<DismissalSettingsResponse>('/school/dismissal-settings',
    { method: 'PUT', body: JSON.stringify(settings) }, token)
}

export function fetchSchoolContact(token: string) {
  return apiRequest<SchoolContact>('/mobile/school-contact', {}, token)
}

export function updateSchoolContact(token: string, phone: string | null) {
  return apiRequest<SchoolContact>('/mobile/school-contact', { method: 'PUT', body: JSON.stringify({ phone }) }, token)
}

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
