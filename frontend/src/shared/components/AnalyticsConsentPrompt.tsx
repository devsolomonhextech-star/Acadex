import { useState } from 'react'
import { analyticsConfigured, analyticsConsentDecision, denyAnalyticsConsent, grantAnalyticsConsent } from '../analytics/posthogSdk'
import type { AnalyticsConsent } from '../analytics/contract'

/**
 * The only place a staff member can grant product analytics consent. Without a
 * stored decision nothing is captured; declining is remembered and never asks
 * again. Hidden entirely when no PostHog project is configured.
 */
export function AnalyticsConsentPrompt() {
  const [decision, setDecision] = useState<AnalyticsConsent>(() => analyticsConsentDecision())
  if (!analyticsConfigured || decision !== 'undecided') return null
  const decide = (next: 'granted' | 'denied') => {
    if (next === 'granted') grantAnalyticsConsent()
    else denyAnalyticsConsent()
    setDecision(next)
  }
  return <aside className="analytics-consent" aria-label="Product analytics choice">
    <strong>Help improve Acadex</strong>
    <p>Share anonymous product usage, such as which support actions staff save. No student records, names, contact details or page addresses are sent.</p>
    <div className="analytics-consent-actions">
      <button type="button" className="analytics-consent-secondary" onClick={() => decide('denied')}>No thanks</button>
      <button type="button" className="analytics-consent-primary" onClick={() => decide('granted')}>Allow analytics</button>
    </div>
  </aside>
}
