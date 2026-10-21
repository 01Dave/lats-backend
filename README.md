# LATS Backend

Standalone Loan Application Tracking System backend for the bank.
Workflow: Sales -> HOD -> Credit Review -> Internal Control -> MD -> Finance.

## Stack
Node.js, Express, TypeScript, PostgreSQL via Prisma, JWT auth, Joi validation.

## Status: Phase 1, Steps 1-6
Auth + RBAC, Application CRUD + workflow state machine, independent
Document upload/verify/download, comments, all four approval-decision
endpoints (HOD/Credit Review/Internal Control/MD), disbursement
(Finance), and admin user management are implemented. Audit log (beyond
the `Approval` trail) and reports are not yet implemented — see
`docs/ARCHITECTURE.md` for the module structure and `docs/BACKEND_REFERENCE.md`
for the full endpoint reference.

**KYC confirmation**: no digital checklist — physical KYC verification
is confirmed by HOD as a single `kycConfirmed: true` flag folded into
their approval decision (`POST /applications/:id/hod-decision`), not a
separate endpoint or checklist.

**Approval history**: every decision (approve/query/decline/reject/
resolve/withdraw) is recorded as a row in the new `Approval` table
(`GET /applications/:id/approvals`) — this is the structured audit trail
of who decided what and when. `Comment` is separate: free-standing case
notes via `POST /applications/:id/comments`, not tied to any specific
decision.

**Scope note**: this system is a digital tracker for a physical
paper-trail process. There is no BVN, no `Customer`/`LoanProduct` table,
and no digital KYC checklist. Documents CAN be uploaded and stored, and
are vetted independently via a simple `status` field
(pending/verified/rejected/expired) on each document — informational
tracking, not a gate.

**If you already migrated a Customer/LoanProduct/KYC-checklist schema**:
that was reverted. `prisma migrate dev` will detect the schema changed
back — reset your dev database (`npx prisma migrate reset --force`) and
re-migrate/re-seed rather than trying to migrate forward from that state.

## Setup
```bash
cp .env.example .env      # then fill in DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev     # applies the committed migrations to your database
npm run seed               # creates one test user per role, password: Password123!
npm run dev
```

`.env` values:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — any long random string
- `FILE_STORAGE_DIR` — where uploaded documents are written (default
  `./uploads`, git-ignored). Back this folder up alongside the database.

## Documentation
- `docs/BACKEND_REFERENCE.md` — API reference for frontend work: request/response
  shapes, statuses and transitions, permissions, error format, and where the
  system deliberately differs from the original specification.
- `docs/ARCHITECTURE.md` — code structure, how the workflow engine works, and
  known limitations to resolve before production.
- `docs/lats-openapi.yaml` — OpenAPI contract for the implemented endpoints.

## Test users (after seeding)
All use password `Password123!`:
- sales@lats.test
- hod@lats.test
- creditreview@lats.test
- internalcontrol@lats.test
- md@lats.test
- finance@lats.test
- admin@lats.test

## Endpoints implemented so far

All routes below are prefixed with `/api/v1` (except `/health`) and require
a Bearer token unless noted.

**Health**
- `GET /health` (no auth)

**Auth**
- `POST /api/v1/auth/login` (no auth)
- `GET /api/v1/auth/me`

**Applications**
- `POST /api/v1/applications` — create (Sales)
- `GET /api/v1/applications` — list, scoped by role (own / branch / all); optional `status`/`branch`/`page`/`limit` query params; returns `{ data, pagination }`
- `GET /api/v1/applications/:id`
- `PATCH /api/v1/applications/:id` — edit, DRAFT-only, creator-only
- `POST /api/v1/applications/:id/submit`
- `POST /api/v1/applications/:id/withdraw` — comment required

**Approval decisions**
- `POST /api/v1/applications/:id/hod-decision` — approve (requires `kycConfirmed: true`) / query / reject
- `POST /api/v1/applications/:id/credit-decision` — approve / query / decline
- `POST /api/v1/applications/:id/internal-control-decision` — approve / query / reject
- `POST /api/v1/applications/:id/md-decision` — approve / reject
- `POST /api/v1/applications/:id/resolve-query` — resolves any of the three query states
- `POST /api/v1/applications/:id/disburse` — Finance only (`disbursement:record`); `PENDING_DISBURSEMENT` -> `DISBURSED`
- `GET /api/v1/applications/:id/approvals` — full decision history

**Comments**
- `GET /api/v1/applications/:id/comments`
- `POST /api/v1/applications/:id/comments`

**Documents**
- `GET /api/v1/applications/:id/documents`
- `POST /api/v1/applications/:id/documents` — multipart/form-data (`file`, `docType`)
- `GET /api/v1/applications/:id/documents/:documentId` — download
- `PATCH /api/v1/applications/:id/documents/:documentId` — set status (`document:verify` permission)

**User management** (all require `admin:users`)
- `POST /api/v1/admin/users` — create (`email`, `name`, `password`, `role`, `branch` if role requires one)
- `GET /api/v1/admin/users` — list
- `GET /api/v1/admin/users/:id` — get one
- `PATCH /api/v1/admin/users/:id` — update name/role/branch/active
- `POST /api/v1/admin/users/:id/reset-password` — admin sets a new password directly

**Security**: CORS is restricted via `CORS_ALLOWED_ORIGINS` (env var, see
`.env.example`) — defaults to allowing any origin so local dev keeps
working unchanged, set it to a real list before any deployment. `bcrypt`
is on v6, which removes the `node-pre-gyp`/`tar` vulnerability chain that
affected v5. `POST /auth/login` is throttled (default 5 attempts per 15
minutes per IP + email → `429` with `Retry-After`; tune via
`LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, and `TRUST_PROXY_HOPS` behind
a proxy). The limiter is in-memory, so it's per-instance and resets on
restart.

**Not yet implemented**: reports, PDF export. (A separate audit log
beyond the `Approval` trail was deliberately not built — `Approval`
already covers who approved/rejected/queried what, and when, which was
confirmed sufficient.)

Full contract: `docs/lats-openapi.yaml`. Note that file predates several
implementation changes (e.g. `phone` vs. `customerPhone`, `tenor` vs.
`tenorMonths`, no customer/product/KYC-checklist endpoints) — treat the
list above as the authoritative record of what actually exists.
