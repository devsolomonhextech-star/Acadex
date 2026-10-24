# SchoolOS

Multi-tenant school operations platform. This fresh project includes tenant provisioning, authentication, student records, and initial academic setup workflows.

## Repository audit

The initial repository contained only Git metadata: no application code, framework, dependencies, database schema, or deployment setup. There are no legacy workflows to preserve. The project brief calls for a React/TypeScript/Vite frontend and a Python/FastAPI backend backed by PostgreSQL, with tenant isolation designed into every data boundary.

## Architecture

### Implemented in this foundation

- School onboarding creates the tenant, initial administrator, and audit event atomically.
- Sign-in, short-lived access tokens, rotating HttpOnly refresh cookies, CSRF checks, logout, and active membership revalidation are wired to PostgreSQL.
- Redis-backed signup/login throttling, liveness/readiness endpoints, and Alembic migrations are in place.
- Student directory supports scoped creation, duplicate admission-number protection, search, status filters, pagination, and tenant-scoped detail reads. The React screen is connected to these APIs.
- Academic years, terms, class groups, and dated student enrollments are school-scoped, audited, role-protected, and constrained against cross-school or cross-year references.
- School administrators can invite teachers with expiring, single-use links. Only a token hash is stored, new accounts choose a password, and existing SchoolOS credentials are preserved.
- Subject and teacher assignments are school-scoped and retained against their class groups. Teacher access to class lists and attendance is limited to assigned classes.
- Daily attendance supports present, absent, late, and excused statuses, class-roster completeness checks, one session per class/date, correction audit events, and tenant-safe reads/writes.
- The assessment gradebook supports class/subject/term assessments, score bounds, partial drafts, complete-roster submission, teacher score entry, and principal/admin approval or return with reviewer feedback.
- School-configurable grading scales require contiguous 0–100 grade bands, support optional class positions, and store the default scale used for new results.
- Weighted term totals aggregate approved assessments per subject (weights normalized over approved assessments, Decimal math), roll up to a weighted term average with grade and optional class position, and can be published per class/term.
- Result publication requires an exact class-name confirmation, locks recomputation and approved score edits while published, and is reversed only through an audited withdraw transition.
- Printable report cards are served per student only from published results, with subject totals, grades, points, term average, class position, and publication attribution; withdrawing a publication revokes them.
- Bulk student import accepts CSV/Excel uploads against a downloadable template, validates every row (required fields, date formats, in-file and existing-student duplicate detection) during a preview that writes nothing, creates records only on explicit confirmation inside a single transaction, skips rows created between preview and confirm, and keeps per-job history with a downloadable problem-row CSV. Routes are role-limited and tenant-scoped.
- Automated PostgreSQL API tests cover identity/session handling, student access, academic setup, enrollment uniqueness, teacher invitations/assignments, attendance corrections, assessment score limits, review locking, grading-scale validation, weighted totals, publication locking, bulk-import preview/confirm transactional behaviour, and cross-school isolation.

Post-approval assessment corrections, analytics, finance, parent, and SaaS billing workflows remain planned. Attendance correction approval, summaries, notifications, and reporting also remain planned. No placeholder screen should be interpreted as an implemented business workflow.

- `frontend/src/app/`: application store, typed Redux hooks, route composition, and startup wiring.
- `frontend/src/features/`: domain-owned auth, students, academics, and overview UI/state/API slices.
- `frontend/src/shared/`: API transport/types/error handling, shared layout, reusable components, and styles grouped by app area.
- Redux Toolkit owns client/session state. TanStack Query owns remote data, request status, cache lifetimes, and synchronization. Forms use React Hook Form and Zod where they fit; Ant Design supplies accessible UI primitives.
- `backend/app/api/`: thin versioned HTTP routes and Pydantic request/response contracts.
- `backend/app/domain/`: extracted domain rules; the student directory is currently the first service module.
- `backend/app/`: FastAPI routes, Pydantic contracts, SQLAlchemy models/sessions, security, and configuration. Keep growing business logic out of route handlers as modules deepen.
- PostgreSQL is the system of record. All tenant-owned rows carry a school scope; services receive an authorized school context and repositories require it explicitly. Database row-level security is a defense-in-depth option after connection-pooling/session semantics are settled.
- Redis and workers are deferred until asynchronous imports, notifications, or report workloads exist. A modular monolith is the right starting point; no service boundary currently justifies microservices.

### Initial entity relationships

`School` owns `Campus`, `AcademicYear`, `Term`, `ClassGroup`, `Subject`, `Student`, `StaffMembership`, `FeeStructure`, and other tenant data. `User` is a global identity; `SchoolMembership` links a user to a school and role grants. `Student` has dated `Enrollment` records per academic year/class, `GuardianLink` records, `AttendanceRecord` entries, versioned `Assessment`/`Result` records, and `Invoice`/`Payment`/`PaymentAllocation` financial records. Published results and posted payments are corrected through auditable adjustments, not silent mutation. Tenant resources use explicit foreign keys, school-scoped unique constraints, and restrictive deletion policies.

### Identity and tenant security

Use short-lived access credentials and rotating, revocable refresh sessions in HttpOnly Secure cookies (SameSite chosen to match deployment origins), CSRF protection for cookie-authenticated mutations, verified invitations, password reset tokens stored hashed, and rate-limited login/recovery. Resolve the active school from an authenticated membership, never from an untrusted request header alone. Enforce role and resource permissions in backend dependencies and domain services; pass school scope to every tenant repository query and verify object ownership before reads or writes. Audit membership, grade, medical-data, and financial changes. Encrypt transport and sensitive backups; restrict access to medical/accessibility notes. Legal and privacy review is required before making jurisdictional compliance claims.

### UI/UX direction

Use a calm, high-contrast indigo/teal palette, clear typography, generous spacing, keyboard-accessible controls, responsive navigation, and explicit empty/loading/error states. The application shell groups navigation into Overview, Academics, People, Finance, and Communications, with school/campus context and role-aware navigation. Each workflow should optimize frequent tasks (attendance and class score entry) for keyboard use and make irreversible publishing/payment actions explicit.

## Roadmap

1. **Foundation (implemented):** architecture, strict React shell, FastAPI configuration and health/readiness routes, PostgreSQL/Redis Compose services, migrations, and local container builds.
2. **Identity and first people workflow (implemented, still hardening):** school provisioning, membership roles, login/session lifecycle, backend role checks, tenant-scoped student directory, signup/login rate limits, hashed staff invitations, migrations, and PostgreSQL isolation tests. Email verification, recovery, invitation delivery, and platform-super-admin setup remain before public production signup.
3. **School setup and people (in progress):** student records, academic years/terms, class groups, year-based enrollments, subjects, staff invitations, subject-teacher assignments, and validated preview/confirm bulk student imports are implemented; campuses remain.
4. **Academic operations (in progress):** daily class attendance, an assessment gradebook with controlled submission/review, configurable grading scales, weighted term aggregation with class positions, audited result publication/withdrawal, and printable report cards are implemented; correction approval and summaries remain.
5. **Finance:** fee structures, invoices, decimal-safe payment allocation, receipts and reconciliation.
6. **Family portals and communication:** guardian links, read-only published records, announcements and delivery integrations.
7. **SaaS operations and production hardening:** plans/entitlements, monitoring, backups/restore, CI/CD, security and representative load testing.

### Main risks and decisions

- Tenant leakage is the highest architectural risk; tenant context must be mandatory in persistence APIs and exercised by negative tests.
- Authentication cookie/origin strategy depends on the eventual deployment domains; keep configuration explicit and avoid weakening defaults for convenience.
- Ghanaian privacy obligations and school policies need qualified review before launch. Minimize sensitive fields and retention from the beginning.
- Grading, promotion, fee schedules, waivers, and ranking are school-configurable policies, not global constants.
- Payment-provider integration is deferred until reconciliation, idempotency, webhook verification, and credentials are designed.
- Operational release readiness will require migrations, backup restoration drills, alerting, CI, and security/performance review; this foundation is not production-ready.

## First milestone: acceptance criteria

- Frontend and backend responsibilities are separated and documented.
- Frontend uses strict TypeScript and loads a responsive, navigable shell with accessible controls.
- Backend starts through FastAPI and exposes a lightweight liveness endpoint.
- Configuration comes from environment variables; committed examples contain placeholders only.
- Local development services are reproducible with Docker Compose and include health checks.
- No workflow is represented as complete before persistence, authorization, and error handling exist.

## Development

See `docs/architecture.md` for boundaries and security invariants. Run `docker compose up --build` to start PostgreSQL, Redis, the API, and the Vite development UI. The API applies pending migrations before it starts. Visit `http://localhost:5173` to create a school workspace; the API is exposed at `http://localhost:8001` by default. For frontend hot reload on the host, use `cd frontend && npm ci && npm run dev`; the API proxy target can be set with `API_PROXY_TARGET` (the default is `http://127.0.0.1:8000`). School onboarding, sign-in, student directory, academic years and terms, class groups, enrollment, teacher invitations, subjects/assignments, daily attendance, and assessment score submission/review are connected. Weighted term aggregation, final publication, finance, and family workflows remain planned. Teacher invitation links are manually shared until an email provider is configured. Dashboard figures are labeled as illustrative and are not live records.

Grading scales, weighted term totals, and result publication are connected: administrators manage contiguous grade bands under **Term results → Grading scales**, registrars/administrators compute totals from approved assessments, and principals/administrators publish or withdraw class results. Report cards open from a student row once results are published and print from the browser. Bulk student import is connected from the Students page: download a template, upload a file to reach a validation preview, then confirm to create records; the history tab keeps every job with its problem-row CSV. Finance and family workflows remain planned.

To run the authentication, tenant, student, and academic API tests, start the isolated test database with `docker compose --profile test up -d postgres-test`, then run `TEST_DATABASE_URL=postgresql+asyncpg://schoolos:schoolos-local-test-only@localhost:5433/schoolos_test python -m pytest` from `backend/`. The test database has its own container volume and port.
