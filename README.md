# LATS Backend

Standalone Loan Application Tracking System backend for the bank.
Workflow: Sales -> HOD -> Credit Review -> Internal Control -> MD -> Finance.

Independent of the Insurance_BS project: separate codebase, PostgreSQL
(not MongoDB), separate deployment.

## Stack
Node.js, Express, TypeScript, PostgreSQL via Prisma, JWT auth, Joi validation.

## Status: Phase 1, Step 1
Auth + RBAC only. Application/KYC/Credit Review/Internal Control/MD/
Disbursement modules are not yet implemented — see
`LATS_Architecture_Brief.md` for the full build order.

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

Full contract: see `docs/lats-openapi.yaml`.
