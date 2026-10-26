# Product analytics: early student support

Instrumentation for one product question in the Acadex student support workspace, using
`posthog-js` in the existing Vite/React frontend. Nothing is deployed and no event is sent by
the checks in this repository.

## Repository evidence

| Item | Value |
| --- | --- |
| Package manager | npm 11.12.1 (`packageManager` field is not declared; the only JS lock is npm's) |
| Browser app package | `frontend/` (`schoolos-web`, Vite 6 + React 19 + TypeScript ~5.7) |
| Server package | `backend/` (`schoolos-api`, uv + `backend/uv.lock`) |
| Original lock files | `frontend/package-lock.json`, `backend/uv.lock` |
| Node used for checks | v24.15.0 |
| Analytics SDK | `posthog-js@1.438.13` in `frontend/package.json` and `frontend/package-lock.json` |

Quality commands that exist in this repository:

- `cd frontend && npm run typecheck` → `tsc -b --pretty`
- `cd frontend && npm run build` → `tsc -b && vite build`
- `cd backend && ruff check app tests` (ruff is configured in `backend/pyproject.toml`)
- `cd backend && pytest` — requires a PostgreSQL test database (`TEST_DATABASE_URL`)

Baseline before this change: `npm run typecheck` passed. The backend suite was not runnable in
this environment (the sandbox refused to execute `backend/.venv/bin/python`), and no backend file
is part of this change. The frontend defines no lint script; nothing here adds one.

No conflicting manager or lock signals were found: no `yarn.lock`, no `pnpm-lock.yaml`, no
Bun lock.

## Question

> When staff open the early-support queue and review a student, how many of those reviews turn
> into a tracked support action — and do those actions get followed up?

The point of the workspace is early support for students, so the useful measure is whether a
review becomes an owned, dated follow-up people can act on, not how many pages were visited.

## Events

Four events, all emitted from the real handlers in
`frontend/src/features/student-support/StudentSupportPage.tsx` through
`frontend/src/shared/analytics/events.ts`. The page's existing UI has no analytics, so nothing
is duplicated or extended.

| Event | Trigger (real code) | Allowed properties |
| --- | --- | --- |
| `support_queue_viewed` | First successful load of the queue per academic year/term — `StudentSupportPage`, `useEffect` guarded by `lastQueueView` | `surface` (`student_support_queue`), `staff_role`, `term_scope` (`term`/`academic_year`), `students_with_signals_bucket` (`0`, `1-5`, `6-20`, `21-50`, `51+`) |
| `support_review_opened` | `openReview(student)` — the **Review** button in "Students for review" | `staff_role`, `support_level` (`urgent_review`/`follow_up`/`monitor`/`no_current_signal`), `signal_count` (0–99), `has_recommendations` |
| `support_action_created` | `createMutation.onSuccess` after `createSupportIntervention` saves | `staff_role`, `support_area`, `assigned_owner`, `has_follow_up_date`, `from_suggestion` |
| `support_followup_updated` | `updateMutation.onSuccess` after `updateSupportIntervention` saves | `staff_role`, `status` (`planned`/`in_progress`/`completed`/`cancelled`), `has_outcome`, `has_follow_up_date` |

Deliberately not sent: student id, name, admission number, class, guardian/contact details,
free-text titles or notes, review scores, queue search terms, page URLs and referrers.

## Identity

`posthog.identify()` uses the opaque `SchoolUser.user_id` (a UUID) only, through
`identifyAnalyticsUser` in `frontend/src/shared/analytics/posthogSdk.ts`, wired in
`AuthProvider` (`frontend/src/features/auth/authHooks.ts`). No email, name or student identifier
is ever used as `distinct_id`; the client rejects any id that is not an opaque token. `reset()`
clears the identity on sign-out. `person_profiles: 'never'` keeps person profiles from being
created.

## Consent

There was no consent surface before this change, so the integrated behaviour is: **no decision
means off**.

- `frontend/src/shared/analytics/posthogSdk.ts` initialises the SDK with
  `opt_out_capturing_by_default: true`.
- Consent is stored in this browser under `acadex.analytics.consent`
  (`frontend/src/shared/analytics/consentStore.ts`); anything other than an explicit `granted` or
  `denied` reads as `undecided`.
- `frontend/src/shared/components/AnalyticsConsentPrompt.tsx` is the only way to grant or decline;
  it appears only when a project is configured and no decision is stored.
- `opt_in_capturing()` / `opt_out_capturing()` follow the stored decision; a decline is remembered.
- There is no cookieless fallback: without a token, a host or a grant, nothing is captured.

## Client wiring and configuration

- Importer: `frontend/src/shared/analytics/posthogSdk.ts` — the only file that imports the SDK
  (dynamic import, skipped entirely when unconfigured). Manifest: `frontend/package.json`,
  resolved version `posthog-js@1.438.13`; lock evidence: `frontend/package-lock.json`
  (`packages["node_modules/posthog-js"].version = 1.438.13`, root dependency pinned exactly),
  installed `frontend/node_modules/posthog-js` reports `1.438.13`.
- Capture gate and allowlist: `frontend/src/shared/analytics/contract.ts` and
  `.../client.ts`; the SDK is initialised with `autocapture`, `capture_pageview`,
  `capture_pageleave` and `capture_dead_clicks` disabled, `disable_session_recording: true`,
  `disable_surveys: true` and `disable_external_dependency_loading: true`.
- `before_send` rebuilds every payload from the event allowlist, so automatic URL/referrer,
  person (`$set`, `$set_once`, `$unset`) and any other extra property never reach delivery.
- Configuration, from `frontend/.env.example` (empty placeholders, values are public). Copy it to
  `frontend/.env.local` — Vite only reads env files inside `frontend/`, so the repository-root
  `.env` does not reach the browser build:
  - `VITE_POSTHOG_PROJECT_TOKEN` — the public project token of your own PostHog project.
  - `VITE_POSTHOG_HOST` — the ingestion host, e.g. `https://us.i.posthog.com` or
    `https://eu.i.posthog.com`. Not inspected live; an unknown/missing host keeps capture off.
- `frontend/.env` and `.env.*` are ignored by git (`.gitignore`); only `.env.example` is tracked.
- Transport failures are swallowed: a capture that fails never changes what the staff member sees.

## Offline checks

`node posthog-analytics.verify.mjs` (root) runs the real handler tests
(`frontend/tests/analytics/support-events.test.mjs`) with the frontend's own Node toolchain,
`shell: false`, an empty child environment, no SDK, no network (`fetch` throws) and a synthetic
in-memory sink. It also reads the manifest and lock (read-only) to confirm the pin and the single
SDK importer, and checks that the backend declares no SDK, the example env holds empty
placeholders, local env files are ignored and no token literal is hardcoded.

The checks prove: missing token/host, undecided consent and denied consent send nothing; each real
action emits exactly one event with only allowlisted properties; email/password/card/student
sentinels, URLs and person metadata are dropped; transport errors leave the action intact;
identity is opaque, flushed late and reset on sign-out.

Not exercised offline: the React render path itself (no browser DOM test runner exists in this
project) and the SDK's own transport (deliberately blocked). Type-checking and the production
build cover the browser wiring.

## Live analysis: start/success funnel over 14 days (pending until events arrive)

- The intended analysis is a funnel, in this event order, on unique staff (`distinct_id`):
  1. `support_queue_viewed` — start of the funnel
  2. `support_review_opened` — review depth
  3. `support_action_created` — success step of the funnel
- Denominator: staff who viewed the early-support queue in the window (step 1 of the funnel).
- Timeframe: rolling 14 days, broken down by `staff_role` and by `support_area`.
- Success measure: share of queue-viewing staff who save at least one tracked support action. A
  healthy secondary signal is the share of `support_action_created` followed by
  `support_followup_updated` (any status) within 14 days — i.e. actions people actually follow up.
- Useful outcome: if review → action conversion is low, the suggestion card / review drawer needs
  work; if follow-up updates are low, the follow-up ownership and reminders do.
