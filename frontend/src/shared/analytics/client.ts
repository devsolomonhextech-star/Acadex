import {
  isAnalyticsConfigured,
  isCaptureEnabled,
  isOpaqueIdentifier,
  safePropertiesFor,
  scrubCapturePayload,
} from './contract.ts'
import type { AnalyticsConsent, ProductEventName } from './contract.ts'

/**
 * Transport boundary for product analytics. The browser wiring in
 * `posthogSdk.ts` registers a PostHog-backed sink; offline checks register an
 * in-memory one. Nothing here imports the SDK, so the capture decisions of the
 * real product handlers can be exercised without a browser or a network.
 */
export type AnalyticsSink = {
  capture: (event: string, properties: Record<string, unknown>) => void
  identify: (distinctId: string) => void
  reset: () => void
  optIn: () => void
  optOut: () => void
}

export type AnalyticsConfig = { projectToken: string; host: string }

export type AnalyticsClient = {
  configure: (config: AnalyticsConfig) => void
  setConsent: (decision: AnalyticsConsent) => void
  consent: () => AnalyticsConsent
  configured: () => boolean
  registerSink: (sink: AnalyticsSink | null) => void
  capture: (event: ProductEventName, properties: Record<string, unknown>) => boolean
  identify: (distinctId: string | null) => boolean
  reset: () => void
}

export function createAnalyticsClient(): AnalyticsClient {
  let config: AnalyticsConfig = { projectToken: '', host: '' }
  let consent: AnalyticsConsent = 'undecided'
  let sink: AnalyticsSink | null = null
  // Held in memory only, and only while the opaque auth id is known. A capture
  // may arrive before the SDK finishes loading, so the id is flushed later.
  let distinctId: string | null = null

  const enabled = () => isCaptureEnabled({ consent, projectToken: config.projectToken, host: config.host })

  const pushConsent = () => {
    if (!sink) return
    try {
      if (enabled()) sink.optIn()
      else sink.optOut()
    } catch { /* analytics must never break the app */ }
  }

  const pushIdentity = () => {
    if (!sink || !distinctId || !enabled()) return
    try { sink.identify(distinctId) } catch { /* swallow transport failures */ }
  }

  return {
    configure(next) {
      config = { projectToken: next.projectToken.trim(), host: next.host.trim() }
      pushConsent()
    },
    setConsent(decision) {
      consent = decision
      pushConsent()
      pushIdentity()
    },
    consent: () => consent,
    configured: () => isAnalyticsConfigured(config),
    registerSink(next) {
      sink = next
      pushConsent()
      pushIdentity()
    },
    capture(event, properties) {
      // Missing token/host, no consent decision and denied consent all stop here.
      if (!sink || !enabled()) return false
      const safe = scrubCapturePayload({ event, properties: safePropertiesFor(event, properties) })
      if (!safe) return false
      try {
        sink.capture(safe.event, safe.properties ?? {})
        return true
      } catch {
        // A failing transport must never affect the staff member's action.
        return false
      }
    },
    identify(nextDistinctId) {
      distinctId = nextDistinctId && isOpaqueIdentifier(nextDistinctId) ? nextDistinctId : null
      if (!distinctId) return false
      if (!sink || !enabled()) return false
      try {
        sink.identify(distinctId)
        return true
      } catch {
        return false
      }
    },
    reset() {
      distinctId = null
      if (!sink) return
      try { sink.reset() } catch { /* swallow transport failures */ }
    },
  }
}

/** The single client the application uses. */
export const analyticsClient = createAnalyticsClient()
