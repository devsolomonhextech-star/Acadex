# Architecture and security invariants

## Frontend boundaries

The React application uses feature folders so screens, API contracts, and domain state stay together:

- `frontend/src/app/` composes routes, the Redux store, and typed dispatch/selector hooks.
- `frontend/src/features/<domain>/` owns each workflow, including its API services, screens, and feature-specific client state.
- `frontend/src/shared/api/` defines the auth transport, shared response types, and error formatting.
- `frontend/src/shared/layout/` and `frontend/src/shared/components/` contain reusable UI that spans features.

Redux Toolkit owns global client/session state. TanStack Query owns remote data, request lifetimes, caching, and synchronization. Session state lives in Redux memory; refresh credentials remain in the server-set HttpOnly cookie. Query caches are cleared when the active session changes. Avoid duplicating remote data in Redux slices or component state.

## Domain boundaries

- **Identity/access:** users, sessions, invitations, school memberships, roles and permission grants.
- **School setup:** school profile, campuses, academic years/terms, grading and reporting policies.
- **People:** student/staff profiles, guardian links, documents, status transitions, dated enrollments, and bulk student import (preview/confirm).
- **Academics:** class/subject/teacher assignments, attendance, assessments, moderation and published results.
- **Finance:** fee schedules, invoices, discounts, payments, allocations, receipts and reconciliation. Core fee structures, invoice generation, payment recording, and allocation are implemented; discounts, reversals, and provider integrations remain.
- **Platform operations:** tenant lifecycle, plans/entitlements, audit and operational health.

Keep HTTP handlers thin. Validate transport data with Pydantic, enforce authorization and business invariants in domain services, and access persistence through explicit tenant-scoped repositories. Frontend navigation is not an authorization boundary.

## Persistence rules

Tenant-owned entities have a non-null `school_id`, indexed foreign keys, school-scoped uniqueness where appropriate, and restrictive deletion. Use `Decimal`/PostgreSQL `NUMERIC` for money. Preserve dated enrollment and assignment history. Published academic records and posted financial transactions are immutable facts with controlled correction records and audit events. Migrations are reviewed and reversible where practical.

## Tenant boundary

1. Authenticate the user and resolve active school membership on the server.
2. Build an immutable request context containing user, school, and permission grants.
3. Require that context in all tenant services and repository operations; never rely on frontend filtering or caller-provided school IDs.
4. Check resource school ownership before returning or changing it.
5. Add database row-level security only with verified transaction-local tenant settings and safe pool reset behavior.
6. Test cross-school read/write attempts for every resource family.

The initial identity implementation enforces active membership on every access-token request, issues short-lived signed access tokens, stores only SHA-256 hashes of random refresh tokens, rotates refresh tokens, invalidates a token family on replay, and requires a double-submit CSRF token for refresh/logout. School registration creates a school and its first administrator in one database transaction. Redis applies distributed IP limits to signup, login, and teacher invitation acceptance, and fails closed when unavailable. Teacher invitations are single use and store only token hashes; email delivery, invitation revocation, email verification, password recovery, and platform-super-admin provisioning remain before public production signup.

The assessment workflow scopes each assessment to one school, academic year, class, subject, and term. Teachers must hold the matching class/subject assignment to create assessments or enter scores. A submitted assessment is locked until an administrator or principal approves it or returns it with feedback; approved scores stay locked. Score and review actions create audit events.

Grading scales are school-owned and must cover 0–100 with contiguous bands; one scale is the default used when computing results, and its `include_positions` flag controls ranking. Weighted term totals only include approved assessments and normalize over their configured weights, so schools are not forced to total exactly 100. Aggregates, grades, and positions are stored as `term_subject_results`/`term_results` rows and recomputed only while the class/term publication is not published. Publishing requires an exact class-name confirmation, records who and when, and blocks recomputation plus approved score edits until an audited withdrawal. Report cards are served only while the class/term publication is published, scoped to the student's active enrollment and the caller's tenant, with teachers limited to their assigned classes; withdrawing a publication revokes report cards along with recomputation. Post-approval assessment corrections remain separate follow-up work.

Bulk student import runs in two phases. The preview phase parses and validates a CSV/Excel upload (canonical column headers, required fields, date formats, in-file and existing-student duplicate detection), persists a tenant-scoped `student_import_jobs` row with per-row outcomes and counts, and writes nothing to the `students` table. The confirm phase re-checks duplicates, creates every still-valid row in one transaction, and skips — rather than fails on — admission numbers created between preview and confirm; any residual unique-constraint race rolls the whole batch back so a retry is safe. Confirming an already-confirmed job returns 409. Every import route is limited to admin/principal/registrar roles, loads jobs through the caller's school scope (cross-tenant access returns 404), enforces upload size and row-count limits before parsing, and records an audit event on confirmation.

Finance treats money as exact values only: `Numeric(12, 2)` columns, `Decimal` arithmetic with half-up quantization to two places, and no floating point anywhere in the backend or in client-side amount handling (amounts travel as strings). Fee structures are scoped to a school, class, and term (one per category/class/term, enforced by a unique constraint) and archived rather than deleted. Invoice generation snapshots each fee into line items so later structure edits never rewrite history, is idempotent per student/term, and is safe to re-run — students already billed are counted as skipped. Payments get a per-school receipt number (count-based sequence with bounded retries against the unique constraint) and reject duplicate references with 409. Allocation is oldest-invoice-first, never exceeds an invoice balance, updates each invoice's `paid_amount` and status in the same transaction as the payment, and any remainder is held as unallocated student credit rather than forced onto an invoice. Manual recording is explicitly not provider confirmation: mobile-money/bank integrations must verify callbacks before marking anything paid. All finance routes require school_admin/principal/finance roles, resolve every resource through the caller's tenant scope (foreign resources return 404), and write audit events for fee-category/structure changes, invoice generation, and payment recording.

## API and operations

Version public APIs under `/api/v1`. Return stable error shapes, paginate collections, set request and upload limits, rate-limit authentication and expensive actions, and log structured request/audit metadata without secrets or sensitive student details. Add background processing only for work with measurable latency or retry needs. Readiness checks should verify dependencies; liveness should remain cheap.
