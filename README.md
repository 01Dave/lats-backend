# LATS Backend

Standalone Loan Application Tracking System backend for the bank.
Workflow: Sales -> HOD -> Credit Review -> Internal Control -> MD -> Finance.

## Stack
Node.js, Express, TypeScript, PostgreSQL via Prisma, JWT auth, Joi validation.

## Status: Phase 1, Steps 1-4
Auth + RBAC, Application CRUD + workflow state machine, independent
Document upload/verify/download, comments, and all four approval-decision
endpoints (HOD/Credit Review/Internal Control/MD) are implemented.
Disbursement and audit log are not yet implemented — see
`LATS_Architecture_Brief.md` for the full build order.

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
- `GET /api/v1/applications` — list, scoped by role (own / branch / all)
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
- `GET /api/v1/applications/:id/approvals` — full decision history

**Comments**
- `GET /api/v1/applications/:id/comments`
- `POST /api/v1/applications/:id/comments`

**Documents**
- `GET /api/v1/applications/:id/documents`
- `POST /api/v1/applications/:id/documents` — multipart/form-data (`file`, `docType`)
- `GET /api/v1/applications/:id/documents/:documentId` — download
- `PATCH /api/v1/applications/:id/documents/:documentId` — set status (`document:verify` permission)

**Not yet implemented**: disbursement, reports, admin endpoints.

Full contract: `docs/lats-openapi.yaml`. Note that file predates several
implementation changes (e.g. `phone` vs. `customerPhone`, `tenor` vs.
`tenorMonths`, no customer/product/KYC-checklist endpoints) — treat the
list above as the authoritative record of what actually exists.
