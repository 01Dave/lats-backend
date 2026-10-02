# LATS Backend — Architecture

This replaces the pre-build architecture brief, which was written before any
code existed and is now historical only. Everything below is drawn directly
from the code in this repo, not from planning notes.

## Stack

Node.js, Express, TypeScript (strict), PostgreSQL via Prisma, JWT auth
(stateless, 12h expiry, no refresh token yet), Joi validation, Jest/Supertest.

## Structure

```
src/
  api/            thin controllers — parse request, call a service, shape the response
  config/         env.ts (fails fast on missing required vars), roles.ts (permission map)
  db/             Prisma client singleton
  middleware/     auth, RBAC, validation, upload, error handling, catchAsync
  routes/         Express routers — this is the map of every real endpoint
  services/       business logic; the only layer that talks to Prisma directly
  utils/          errors.ts (typed error classes), file-storage.ts, app-number-generator.ts, logger.ts
  validators/     Joi schemas
  workflow/       statuses.ts + state-machine.ts — see below, this is the core of the system
scripts/seed.ts   seeds 7 test users, one per role, password Password123!
prisma/schema.prisma
docs/             this file, BACKEND_REFERENCE.md (for frontend work), lats-openapi.yaml
```

Controllers never touch Prisma directly. Services never assign
`application.status` directly — every status change goes through
`workflow/state-machine.ts`.

## The workflow engine

`workflow/state-machine.ts` is a table of named actions, each with a required
starting status, the role allowed to perform it, and whether a comment is
mandatory:

```ts
hod_query:   { from: "HOD_IN_REVIEW", to: "HOD_QUERY",       actor: "hod",   commentRequired: true  }
hod_resolve: { from: "HOD_QUERY",     to: "HOD_IN_REVIEW",   actor: "sales", commentRequired: true  }
hod_approve: { from: "HOD_IN_REVIEW", to: "HOD_APPROVED",    actor: "hod",   commentRequired: false }
```

`applyAction()` checks the current status against `from`, the caller's role
against `actor`, and whether a comment was supplied against
`commentRequired` — throwing `InvalidTransitionError` (mapped to HTTP 409) if
any of those fail. This is the single source of truth for what's allowed;
nothing else in the codebase duplicates these rules.

**Auto-chaining.** A handful of statuses (`SUBMITTED`, `HOD_APPROVED`,
`CREDIT_APPROVED`, `IC_APPROVED`, `MD_APPROVED`) exist in the enum but are
never actually returned by an endpoint. `applyAction()` chains through them
automatically to the next stage's `*_IN_REVIEW`/`PENDING_*` status in the same
call, because those intermediate statuses have no independent action attached
to them — nobody "owns" a case sitting at `HOD_APPROVED`, so there's no reason
to stop there.

**A transition already defined but not reachable via any endpoint:**
`finance_disburse: { from: "PENDING_DISBURSEMENT", to: "DISBURSED", actor: "finance" }`.
The rule exists; there's no route, controller, or service calling it yet.
Building disbursement is mostly wiring an endpoint to an action that's
already correctly defined, not designing new logic.

**Withdraw** is handled separately from the table above because it's valid
from almost any open status, not from one specific one.

## Decisions and history

`approval-service.ts` is the layer above the state machine — it takes a
plain-English decision (`"approve"`, `"query"`, etc.), maps it to the state
machine's action name, calls `applyAction()`, and — in the same database
transaction as the status update — writes a row to the `Approval` table
recording who did what, with what comment, resulting in what status. That
table is the audit trail: `GET /applications/:id/approvals` just reads it
back in order.

`Comment` is a separate, simpler table for free-standing notes not tied to
any specific decision.

## Visibility scoping

`application:view:own` / `:branch` / `:all` are enforced in one place —
`visibilityWhere()` in `application-service.ts` — used by every read path.
An application outside the caller's scope returns `404`, not `403`, so a
Sales user can't tell the difference between "doesn't exist" and "exists but
isn't theirs."

## Documents

Stored on local disk under `FILE_STORAGE_DIR` (default `./uploads`,
git-ignored), behind a three-function interface (`saveFile`/`getFile`/
`deleteFile` in `utils/file-storage.ts`) — a later move to S3-compatible
storage is a new implementation of those three functions, not a rewrite of
anything that calls them. Filenames on disk are random UUIDs, never the
uploaded filename, so there's no path-traversal or collision risk; the
original filename is kept separately in the database for display.

Documents are versioned: re-uploading the same `docType` marks the previous
row `current: false` and creates a new one, rather than overwriting.

Document review status (`pending`/`verified`/`rejected`/`expired`) is
independent of the workflow — set directly by whoever reviews it, gates
nothing.

## Known limitations

These are real gaps, not oversights hidden from you — worth resolving
deliberately rather than discovering in production:

1. **`PATCH /applications/:id` only works while `DRAFT`.** Once submitted,
   there is still no way to correct a field — a query response is only a
   comment via `resolve-query`, not an edit to the underlying data. Whether
   editing during a query should be allowed is a separate, deliberately
   undecided question (see project notes).
3. **No case-owner assignment or reassignment**, and no status/branch
   filtering or pagination on `GET /applications` — it returns everything the
   caller's permission scope allows, always, unfiltered.
4. **Document upload trusts the declared MIME type**, not the actual file
   content. A renamed text file with a `.pdf` extension is accepted.
5. **CORS allows any origin.** Fine for local development; needs restricting
   before any real deployment.
6. **No user-management endpoints.** Users only exist via the seed script;
   there's no way to create, deactivate, or change a real user's role through
   the API.
7. **Test coverage is auth-gating only for most new endpoints** (confirms a
   401 with no token) plus unit tests for the state machine, roles, and file
   storage. The full multi-stage workflow was verified by hand against a
   real database, not by an automated end-to-end test — there's a real gap
   between "the code was exercised" and "there's a regression test."
8. **`bcrypt`'s dependency chain currently has known vulnerabilities**
   (`npm audit`: 2 high, 1 critical, all through `node-pre-gyp`/`tar` at
   install time, not through request handling). Fixing it means a major
   version bump of `bcrypt`, untested against this codebase.

## What's not built at all

Disbursement, a dedicated audit-log endpoint (though `Approval` already
covers workflow decisions — whether that's sufficient or something broader
was intended is worth clarifying), PDF export, reports, admin endpoints.
