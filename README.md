# LATS Backend

Standalone Loan Application Tracking System backend for the bank.
Workflow: Sales -> HOD -> Credit Review -> Internal Control -> MD -> Finance.

Independent of the Insurance_BS project: separate codebase, PostgreSQL
(not MongoDB), separate deployment.

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
npx prisma migrate dev --name init
npm run seed               # creates one test user per role, password: Password123!
npm run dev
```

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
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /health`

Full contract: see `docs/lats-openapi.yaml`. Note: a couple of fields in that
contract are stale versus the actual implementation (e.g. `phone` vs.
`customerPhone`, `tenor` vs. `tenorMonths`) — see LATS_Contract_Alignment_Notes
for the current reconciliation until the yaml itself is updated to match.
