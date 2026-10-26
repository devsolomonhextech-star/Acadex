import type { CaptureResult } from 'posthog-js'
import { analyticsClient } from './client.ts'
import { browserConsentStorage, persistConsent, readStoredConsent } from './consentStore.ts'
import { scrubCapturePayload } from './contract.ts'
import type { AnalyticsConsent } from './contract.ts'

/**
 * Browser boundary for product analytics.
 *
 * The public project token and ingestion host come from Vite configuration
 * (`VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`). With either missing the
 * integration stays inert: the SDK is never initialised and no event is sent.
 * There is no cookieless fallback and no localStorage-only tracking: consent is
 * an explicit grant recorded in this browser, and no decision means off.
 */
const projectToken = (import.meta.env.VITE_POSTHOG_PROJECT_TOKEN ?? '').trim()
const host = (import.meta.env.VITE_POSTHOG_HOST ?? '').trim()

export const analyticsConfigured = projectToken.length > 0 && host.length > 0

let started = false
let sdkLoad: Promise<void> | null = null

export function startProductAnalytics(): void {
  if (started) return
  started = true
  analyticsClient.configure({ projectToken, host })
  analyticsClient.setConsent(readStoredConsent(browserConsentStorage()))
  if (!analyticsConfigured) return
  sdkLoad ??= loadPostHog()
}

async function loadPostHog(): Promise<void> {
  try {
    const { default: posthog } = await import('posthog-js')
    posthog.init(projectToken, {
      api_host: host,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      capture_dead_clicks: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      person_profiles: 'never',
      opt_out_capturing_by_default: true,
      // Final gate before delivery: rebuild every payload from the event
      // allowlist so URLs, referrers and person metadata are never transmitted.
      before_send: (payload: CaptureResult) => scrubCapturePayload(payload) as CaptureResult | null,
    })
    analyticsClient.registerSink({
      capture: (event, properties) => posthog.capture(event, properties),
      identify: distinctId => posthog.identify(distinctId),
      reset: () => posthog.reset(),
      optIn: () => posthog.opt_in_capturing(),
      optOut: () => posthog.opt_out_capturing(),
    })
  } catch {
    // Analytics is optional: a failed SDK load must not affect the workspace.
  }
}

export function analyticsConsentDecision(): AnalyticsConsent {
  return analyticsClient.consent()
}

export function grantAnalyticsConsent(): void {
  persistConsent(browserConsentStorage(), 'granted')
  analyticsClient.setConsent('granted')
}

export function denyAnalyticsConsent(): void {
  persistConsent(browserConsentStorage(), 'denied')
  analyticsClient.setConsent('denied')
}

/** The opaque auth id only; identity is never derived from email or display name. */
export function identifyAnalyticsUser(userId: string | null): void {
  analyticsClient.identify(userId)
}

export function resetAnalyticsUser(): void {
  analyticsClient.reset()
}
