/**
 * Offline checks for the product analytics integration.
 *
 * These run the real product handlers from
 * `src/shared/analytics/events.ts` — the same functions the student support
 * screen calls — against the real capture client, with the SDK replaced by an
 * in-memory sink. No browser, no SDK, no environment and no network: the child
 * process runs with an empty environment and `fetch` is stubbed to fail.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { analyticsClient } from '../../src/shared/analytics/client.ts'
import {
  bucketSupportVolume,
  isOpaqueIdentifier,
  PRODUCT_EVENT_SCHEMA,
  safePropertiesFor,
  scrubCapturePayload,
} from '../../src/shared/analytics/contract.ts'
import {
  readStoredConsent,
  persistConsent,
  ANALYTICS_CONSENT_KEY,
} from '../../src/shared/analytics/consentStore.ts'
import {
  trackSupportActionCreated,
  trackSupportFollowUpUpdated,
  trackSupportQueueViewed,
  trackSupportReviewOpened,
} from '../../src/shared/analytics/events.ts'

// Synthetic configuration only. This is not a PostHog token and is never sent.
const SYNTHETIC_TOKEN = 'offline-check-public-project-token'
const SYNTHETIC_HOST = 'https://ingestion.offline-check.test'
const SENSITIVE = {
  email: 'afua.agyeman@example-school.test',
  password: 'Sentinel-Password-9f3!',
  card: '4111111111111111',
  studentId: '6ee1f0c4-0000-4000-8000-000000000001',
  studentName: 'Afua Agyeman',
}

let networkCalls = 0
globalThis.fetch = () => {
  networkCalls += 1
  throw new Error('network disabled for offline analytics checks')
}

function resetClient({ token = SYNTHETIC_TOKEN, host = SYNTHETIC_HOST, consent = 'granted' } = {}) {
  analyticsClient.registerSink(null)
  analyticsClient.identify(null)
  analyticsClient.configure({ projectToken: '', host: '' })
  analyticsClient.setConsent('undecided')
  analyticsClient.configure({ projectToken: token, host })
  analyticsClient.setConsent(consent)
}

function recorder() {
  const calls = []
  const sink = {
    capture: (event, properties) => { calls.push({ event, properties }) },
    identify: distinctId => { calls.push({ identify: distinctId }) },
    reset: () => { calls.push({ reset: true }) },
    optIn: () => { calls.push({ optIn: true }) },
    optOut: () => { calls.push({ optOut: true }) },
  }
  return { calls, sink, events: () => calls.filter(call => call.event) }
}

function runEveryJourneyAction() {
  return [
    trackSupportQueueViewed({ staffRole: 'teacher', termScope: 'term', studentsWithSignals: 7 }),
    trackSupportReviewOpened({ staffRole: 'teacher', supportLevel: 'follow_up', signalCount: 3, hasRecommendations: true }),
    trackSupportActionCreated({
      staffRole: 'teacher', supportArea: 'attendance', assignedOwner: true, hasFollowUpDate: true, fromSuggestion: false,
    }),
    trackSupportFollowUpUpdated({ staffRole: 'teacher', status: 'completed', hasOutcome: true, hasFollowUpDate: true }),
  ]
}

test('missing project token sends nothing', () => {
  resetClient({ token: '' })
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  const results = runEveryJourneyAction()
  assert.deepEqual(events(), [])
  assert.deepEqual(results, [false, false, false, false])
})

test('missing ingestion host sends nothing', () => {
  resetClient({ host: '' })
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  runEveryJourneyAction()
  assert.deepEqual(events(), [])
})

test('no consent decision and a declined decision both send nothing', () => {
  resetClient({ consent: 'undecided' })
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  runEveryJourneyAction()
  assert.deepEqual(events(), [])

  resetClient({ consent: 'denied' })
  const denied = recorder()
  analyticsClient.registerSink(denied.sink)
  runEveryJourneyAction()
  assert.deepEqual(denied.events(), [])
  assert.ok(!denied.calls.some(call => call.optIn), 'denied consent must never opt in')
})

test('granting consent after the sink is registered starts capture', () => {
  resetClient({ consent: 'undecided' })
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  trackSupportQueueViewed({ staffRole: 'principal', termScope: 'academic_year', studentsWithSignals: 0 })
  assert.deepEqual(events(), [])

  analyticsClient.setConsent('granted')
  trackSupportQueueViewed({ staffRole: 'principal', termScope: 'academic_year', studentsWithSignals: 0 })
  assert.equal(events().length, 1)
  assert.equal(events()[0].event, 'support_queue_viewed')
})

test('each real action emits exactly once with only allowlisted properties', () => {
  resetClient()
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  const results = runEveryJourneyAction()
  assert.deepEqual(results, [true, true, true, true])
  assert.deepEqual(events().map(call => call.event), [
    'support_queue_viewed',
    'support_review_opened',
    'support_action_created',
    'support_followup_updated',
  ])
  assert.deepEqual(events()[0].properties, {
    surface: 'student_support_queue',
    staff_role: 'teacher',
    term_scope: 'term',
    students_with_signals_bucket: '6-20',
  })
  assert.deepEqual(events()[1].properties, {
    staff_role: 'teacher',
    support_level: 'follow_up',
    signal_count: 3,
    has_recommendations: true,
  })
  assert.deepEqual(events()[2].properties, {
    staff_role: 'teacher',
    support_area: 'attendance',
    assigned_owner: true,
    has_follow_up_date: true,
    from_suggestion: false,
  })
  assert.deepEqual(events()[3].properties, {
    staff_role: 'teacher',
    status: 'completed',
    has_outcome: true,
    has_follow_up_date: true,
  })
})

test('properties outside the event contract are dropped', () => {
  resetClient()
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  analyticsClient.capture('support_action_created', {
    staff_role: 'teacher',
    support_area: 'wellbeing',
    assigned_owner: false,
    has_follow_up_date: false,
    from_suggestion: true,
    student_name: SENSITIVE.studentName,
    student_id: SENSITIVE.studentId,
    student_email: SENSITIVE.email,
    note: `call ${SENSITIVE.email} / ${SENSITIVE.password}`,
    $current_url: `https://app.example-school.test/students/${SENSITIVE.studentId}?email=${SENSITIVE.email}`,
  })
  assert.equal(events().length, 1)
  assert.deepEqual(events()[0].properties, {
    staff_role: 'teacher',
    support_area: 'wellbeing',
    assigned_owner: false,
    has_follow_up_date: false,
    from_suggestion: true,
  })
  const serialized = JSON.stringify(events())
  for (const sentinel of Object.values(SENSITIVE)) assert.ok(!serialized.includes(sentinel), `leaked ${sentinel}`)
})

test('unsafe property values and unknown roles are not forwarded', () => {
  resetClient()
  const { sink, events } = recorder()
  analyticsClient.registerSink(sink)
  trackSupportReviewOpened({
    staffRole: 'teacher', supportLevel: 'not_a_band', signalCount: 400, hasRecommendations: 'yes',
  })
  // An out-of-contract band, an out-of-range count and a non-boolean are all dropped.
  assert.deepEqual(events()[0].properties, { staff_role: 'teacher' })
  assert.deepEqual(safePropertiesFor('support_review_opened', { staff_role: SENSITIVE.email }), {})
})

test('before_send scrubs URLs, referrers and person metadata', () => {
  const scrubbed = scrubCapturePayload({
    uuid: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90',
    event: 'support_action_created',
    properties: {
      staff_role: 'teacher',
      support_area: 'academic',
      $current_url: `https://app.example-school.test/student-support?student=${SENSITIVE.studentName}`,
      $referrer: `https://mail.example-school.test/?token=${SENSITIVE.password}`,
      $pathname: '/student-support',
      $host: 'app.example-school.test',
      distinct_id: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90',
      token: SYNTHETIC_TOKEN,
    },
    $set: { email: SENSITIVE.email, name: SENSITIVE.studentName },
    $set_once: { card: SENSITIVE.card },
  })
  assert.ok(scrubbed)
  assert.deepEqual(scrubbed.properties, {
    staff_role: 'teacher',
    support_area: 'academic',
    distinct_id: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90',
    token: SYNTHETIC_TOKEN,
  })
  const serialized = JSON.stringify(scrubbed)
  for (const sentinel of Object.values(SENSITIVE)) assert.ok(!serialized.includes(sentinel), `leaked ${sentinel}`)
  assert.ok(!serialized.includes('example-school.test/student-support'))
})

test('before_send drops anything outside the product contract', () => {
  assert.equal(scrubCapturePayload({ event: '$pageview', properties: { $current_url: 'https://x.test/a' } }), null)
  assert.equal(scrubCapturePayload({ event: '$autocapture', properties: {} }), null)
  assert.equal(scrubCapturePayload({ event: 'custom_event', properties: {} }), null)
  assert.equal(scrubCapturePayload(null), null)
  const identify = scrubCapturePayload({
    event: '$identify',
    properties: { distinct_id: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90', $set: { email: SENSITIVE.email } },
    $set: { email: SENSITIVE.email },
  })
  assert.deepEqual(identify.properties, { distinct_id: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90' })
})

test('a failing transport leaves the staff member workflow intact', () => {
  resetClient()
  analyticsClient.registerSink({
    capture: () => { throw new Error('transport unavailable') },
    identify: () => { throw new Error('transport unavailable') },
    reset: () => { throw new Error('transport unavailable') },
    optIn: () => { throw new Error('transport unavailable') },
    optOut: () => { throw new Error('transport unavailable') },
  })
  let tracked
  assert.doesNotThrow(() => {
    tracked = trackSupportActionCreated({
      staffRole: 'school_admin', supportArea: 'family_contact', assignedOwner: false, hasFollowUpDate: false, fromSuggestion: true,
    })
  })
  assert.equal(tracked, false)
  assert.doesNotThrow(() => trackSupportFollowUpUpdated({ staffRole: 'school_admin', status: 'in_progress', hasOutcome: false, hasFollowUpDate: true }))
  assert.doesNotThrow(() => analyticsClient.identify('b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90'))
})

test('identity is the opaque auth id, flushes late and resets on sign-out', () => {
  resetClient()
  const { sink, calls } = recorder()
  analyticsClient.identify('b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90')
  analyticsClient.registerSink(sink)
  assert.deepEqual(calls.filter(call => call.identify), [{ identify: 'b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90' }])

  analyticsClient.reset()
  assert.ok(calls.some(call => call.reset))

  resetClient({ consent: 'denied' })
  const denied = recorder()
  analyticsClient.registerSink(denied.sink)
  analyticsClient.identify('b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90')
  assert.ok(!denied.calls.some(call => call.identify), 'no identity without consent')

  assert.equal(isOpaqueIdentifier('b7d1c2f0-3b0f-4c4a-9d7d-2f5a1e6c8b90'), true)
  assert.equal(isOpaqueIdentifier(SENSITIVE.email), false)
  assert.equal(isOpaqueIdentifier(SENSITIVE.studentName), false)
  assert.equal(analyticsClient.identify(SENSITIVE.email), false)
})

test('consent storage defaults to undecided and remembers an explicit decision', () => {
  const store = new Map()
  const storage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) }
  assert.equal(readStoredConsent(null), 'undecided')
  assert.equal(readStoredConsent(storage), 'undecided')

  persistConsent(storage, 'granted')
  assert.equal(store.get(ANALYTICS_CONSENT_KEY), 'granted')
  assert.equal(readStoredConsent(storage), 'granted')

  persistConsent(storage, 'denied')
  assert.equal(readStoredConsent(storage), 'denied')

  store.set(ANALYTICS_CONSENT_KEY, 'yes-please')
  assert.equal(readStoredConsent(storage), 'undecided')

  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(readStoredConsent(broken), 'undecided')
  assert.doesNotThrow(() => persistConsent(broken, 'granted'))
})

test('queue volume is bucketed so exact counts are never reported', () => {
  assert.equal(bucketSupportVolume(0), '0')
  assert.equal(bucketSupportVolume(-3), '0')
  assert.equal(bucketSupportVolume(1), '1-5')
  assert.equal(bucketSupportVolume(5), '1-5')
  assert.equal(bucketSupportVolume(6), '6-20')
  assert.equal(bucketSupportVolume(20), '6-20')
  assert.equal(bucketSupportVolume(21), '21-50')
  assert.equal(bucketSupportVolume(51), '51+')
  assert.equal(bucketSupportVolume(Number.NaN), '0')
})

test('the student support screen calls every product handler', () => {
  const page = readFileSync(
    fileURLToPath(new URL('../../src/features/student-support/StudentSupportPage.tsx', import.meta.url)),
    'utf8',
  )
  for (const handler of [
    'trackSupportQueueViewed(',
    'trackSupportReviewOpened(',
    'trackSupportActionCreated(',
    'trackSupportFollowUpUpdated(',
  ]) assert.ok(page.includes(handler), `${handler} is not wired into the student support screen`)
  assert.ok(page.includes('openReview(row)'), 'the review action must go through openReview')
})

test('the contract only ever names the four early-support events', () => {
  assert.deepEqual(Object.keys(PRODUCT_EVENT_SCHEMA).sort(), [
    'support_action_created',
    'support_followup_updated',
    'support_queue_viewed',
    'support_review_opened',
  ])
})

test('the offline checks attempted no network calls', () => {
  assert.equal(networkCalls, 0)
})
