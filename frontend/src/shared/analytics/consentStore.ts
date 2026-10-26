import type { AnalyticsConsent } from './contract.ts'

/**
 * Consent lives in the staff member's browser only. Anything other than an
 * explicit grant — no stored decision, unreadable storage, a tampered value —
 * resolves to `undecided`, and the client keeps capture off.
 */
export const ANALYTICS_CONSENT_KEY = 'acadex.analytics.consent'

export type ConsentStorage = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function readStoredConsent(storage: ConsentStorage | null): AnalyticsConsent {
  try {
    const stored = storage?.getItem(ANALYTICS_CONSENT_KEY)
    return stored === 'granted' || stored === 'denied' ? stored : 'undecided'
  } catch {
    return 'undecided'
  }
}

export function persistConsent(storage: ConsentStorage | null, decision: 'granted' | 'denied'): void {
  try {
    storage?.setItem(ANALYTICS_CONSENT_KEY, decision)
  } catch { /* a blocked storage write leaves consent undecided, which is off */ }
}

export function browserConsentStorage(): ConsentStorage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
