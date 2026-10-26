/**
 * Product analytics contract for Acadex.
 *
 * Everything here is pure: no SDK import, no `import.meta.env`, no window. The
 * shared analytics client and its offline checks both build on these helpers so
 * that the same allowlist and scrub rules run in the browser and in the tests.
 *
 * Privacy rules encoded here:
 * - only the four early-support events below may ever be sent;
 * - only the named, validated properties of each event survive the allowlist;
 * - automatic PostHog metadata (URL, referrer, person properties, device/geo
 *   enrichment) is stripped before an event reaches the transport;
 * - nothing is captured unless a project token and host are configured AND the
 *   staff member has explicitly granted analytics consent.
 */

export type AnalyticsConsent = 'granted' | 'denied' | 'undecided'

export type ProductEventName =
  | 'support_queue_viewed'
  | 'support_review_opened'
  | 'support_action_created'
  | 'support_followup_updated'

type PropertyRule =
  | { kind: 'const'; value: string }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'boolean' }
  | { kind: 'count'; max: number }

const SUPPORT_LEVELS = ['urgent_review', 'follow_up', 'monitor', 'no_current_signal'] as const
const SUPPORT_AREAS = ['attendance', 'academic', 'assignment', 'wellbeing', 'family_contact', 'other'] as const
const FOLLOW_UP_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const
const TERM_SCOPES = ['term', 'academic_year'] as const
const VOLUME_BUCKETS = ['0', '1-5', '6-20', '21-50', '51+'] as const
const STAFF_ROLES = ['school_admin', 'principal', 'registrar', 'teacher', 'staff', 'finance', 'parent'] as const

export const PRODUCT_EVENT_SCHEMA = {
  support_queue_viewed: {
    surface: { kind: 'const', value: 'student_support_queue' },
    staff_role: { kind: 'enum', values: STAFF_ROLES },
    term_scope: { kind: 'enum', values: TERM_SCOPES },
    students_with_signals_bucket: { kind: 'enum', values: VOLUME_BUCKETS },
  },
  support_review_opened: {
    staff_role: { kind: 'enum', values: STAFF_ROLES },
    support_level: { kind: 'enum', values: SUPPORT_LEVELS },
    signal_count: { kind: 'count', max: 99 },
    has_recommendations: { kind: 'boolean' },
  },
  support_action_created: {
    staff_role: { kind: 'enum', values: STAFF_ROLES },
    support_area: { kind: 'enum', values: SUPPORT_AREAS },
    assigned_owner: { kind: 'boolean' },
    has_follow_up_date: { kind: 'boolean' },
    from_suggestion: { kind: 'boolean' },
  },
  support_followup_updated: {
    staff_role: { kind: 'enum', values: STAFF_ROLES },
    status: { kind: 'enum', values: FOLLOW_UP_STATUSES },
    has_outcome: { kind: 'boolean' },
    has_follow_up_date: { kind: 'boolean' },
  },
} as const satisfies Record<ProductEventName, Record<string, PropertyRule>>

export function isProductEventName(value: string): value is ProductEventName {
  return Object.prototype.hasOwnProperty.call(PRODUCT_EVENT_SCHEMA, value)
}

function matchesRule(rule: PropertyRule, value: unknown): boolean {
  if (rule.kind === 'boolean') return typeof value === 'boolean'
  if (rule.kind === 'count') return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= rule.max
  if (typeof value !== 'string') return false
  const candidate = value.trim()
  if (rule.kind === 'const') return candidate === rule.value
  return (rule.values as readonly string[]).includes(candidate)
}

/** Keeps only the allowlisted, well-formed properties of a product event. */
export function safePropertiesFor(event: ProductEventName, properties: Record<string, unknown>): Record<string, unknown> {
  const schema: Record<string, PropertyRule> = PRODUCT_EVENT_SCHEMA[event]
  const safe: Record<string, unknown> = {}
  for (const [key, rule] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) continue
    const value = properties[key]
    if (!matchesRule(rule, value)) continue
    safe[key] = typeof value === 'string' ? value.trim() : value
  }
  return safe
}

/** Coarse volume bucket so queue size is comparable without exact counts over time. */
export function bucketSupportVolume(count: number): (typeof VOLUME_BUCKETS)[number] {
  if (!Number.isFinite(count) || count <= 0) return '0'
  if (count <= 5) return '1-5'
  if (count <= 20) return '6-20'
  if (count <= 50) return '21-50'
  return '51+'
}

const OPAQUE_IDENTIFIER = /^[A-Za-z0-9_-]{8,128}$/

/** Analytics identity is the opaque auth id only — never a name, email or student id. */
export function isOpaqueIdentifier(value: string): boolean {
  return OPAQUE_IDENTIFIER.test(value)
}

export function isAnalyticsConfigured({ projectToken, host }: { projectToken: string; host: string }): boolean {
  return projectToken.trim().length > 0 && host.trim().length > 0
}

export function isCaptureEnabled(input: { consent: AnalyticsConsent; projectToken: string; host: string }): boolean {
  return input.consent === 'granted' && isAnalyticsConfigured(input)
}

export type ScrubbableCapture = {
  uuid?: string
  event: string
  properties?: Record<string, unknown> | null
  timestamp?: Date
  $set?: Record<string, unknown>
  $set_once?: Record<string, unknown>
  $unset?: string[]
}

const TRANSPORT_KEYS = ['distinct_id', 'token'] as const
const IDENTIFY_EVENT = '$identify'

/**
 * `before_send` gate for the browser client: drops any event that is not part of
 * the product contract and rebuilds the payload from the property allowlist, so
 * page URLs, referrers, person properties and any accidental extra property are
 * removed before delivery.
 */
export function scrubCapturePayload(payload: ScrubbableCapture | null): ScrubbableCapture | null {
  if (!payload || typeof payload.event !== 'string') return null
  const isIdentify = payload.event === IDENTIFY_EVENT
  if (!isIdentify && !isProductEventName(payload.event)) return null
  const source = payload.properties ?? {}
  const safe = isIdentify ? {} : safePropertiesFor(payload.event as ProductEventName, source)
  for (const key of TRANSPORT_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.length > 0) safe[key] = value
  }
  const scrubbed: ScrubbableCapture = { event: payload.event, properties: safe }
  if (typeof payload.uuid === 'string') scrubbed.uuid = payload.uuid
  if (payload.timestamp instanceof Date) scrubbed.timestamp = payload.timestamp
  return scrubbed
}
