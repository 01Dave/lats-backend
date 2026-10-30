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
  config/         env.ts (fails fast on missing required vars), roles.ts (permission map), loan-types.ts (the 8 approved loan types)
  db/             Prisma client singleton
  middleware/     auth, RBAC, validation, upload, error handling, catchAsync
  routes/         Express routers — this is the map of every real endpoint
  services/       business logic; the only layer that talks to Prisma directly
  utils/          errors.ts (typed error classes), file-storage.ts, app-number-generator.ts, logger.ts
  validators/     Joi schemas
  workflow/       statuses.ts + state-machine.ts (the core of the system, see below) + allowed-actions.ts (the per-viewer "what can I do" hint)
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

**Disbursement** (`finance_disburse: { from: "PENDING_DISBURSEMENT", to:
"DISBURSED", actor: "finance", commentRequired: false }`) is now wired up:
`POST /applications/:id/disburse`, gated on `disbursement:record`
(already assigned to `finance`, unused until now). It follows the exact
same `executeDecision()` pattern as the other four decision endpoints —
one `Approval` row (`stage: "FINANCE"`, `decision: "DISBURSE"`) in the
same transaction as the status update. `DISBURSED` is not in
`SYSTEM_CHAIN`, so it's a real resting/terminal status, not auto-chained
anywhere further.

The data Finance records rides along on `Application` itself, same
pattern as `kycConfirmed*`: `disbursedAmount`, `disbursementDate`,
`disbursementMethod` (free text), `disbursementReference` (optional —
not every channel produces one), `disbursedById`/`disbursedAt` (from the
authenticated actor and server clock, not the request body). One
disbursement per application — there's no partial/tranche disbursement
in scope, so this didn't need its own table.

**Withdraw** is handled separately from the table above because it's valid
from almost any open status, not from one specific one.

## Validation rules from the business

Three input rules live in `validators/application-validator.ts` (Joi), so
they hold no matter which client calls the API:

- **Loan type.** `productName` must be one of the 8 approved types in
  `config/loan-types.ts` (pure, unit-tested). The same array is served by
  `GET /meta/loan-types` for the frontend dropdown, so there is one list.
  Changing the list is a code change by design. Existing rows keep whatever
  free text they were created with; the rule applies to create and edit.
- **Purpose.** Letters (any alphabet) and single spaces between words only
  (`PURPOSE_PATTERN`) — no digits or symbols. Surrounding whitespace is
  trimmed.
- **Amount and tenor.** Deliberately unlimited: `requestedAmount` any
  positive number, `tenorMonths` any positive whole number. Sales treats
  both as flexible, so no min/max was added. Without a ceiling, a typo like
  an extra zero is not caught by the API. Adding limits later is a small
  validator change.

Clients that still send `branch` (create/update application, the list query,
or the admin user endpoints) are tolerated: the validators drop it with
`Joi.any().strip()` instead of returning `422`, so the frontend and backend
can be updated in either order.

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

`application:view:own` / `:all` are enforced in one place —
`visibilityWhere()` in `application-service.ts` — used by every read path.
Sales see only the applications they created (`own`); every other role sees
all of them (`all`). There is no branch scoping: the bank is single-branch,
so `application:view:branch` and the `roleRequiresBranch()` rule were
removed. `Application.branch` stays as a column (default `"Main"`) and is
still returned in responses, but it is not an input and nothing filters on
it.
An application outside the caller's scope returns `404`, not `403`, so a
Sales user can't tell the difference between "doesn't exist" and "exists but
isn't theirs."

**Filtering and pagination** on `GET /applications` build on top of this,
not instead of it: `listApplicationsQuerySchema`
(`validators/application-validator.ts`) validates/defaults `status`,
`page`, `limit` from the query string, then
`listApplications()` spreads `status` into the same `where`
clause *after* `visibilityWhere()` — so a filter can only narrow an
already-scoped result, never escape it. Pagination math
(`totalPages`, the zero-total edge case) lives in `utils/pagination.ts`,
pure and independently unit-tested, same convention as `roles.ts`/
`cors.ts`. The response is now an envelope (`{ data, pagination }`), a
breaking change from the previous bare-array shape — flag this to
whoever's consuming the endpoint on the frontend.

## Case owner

Every application has an `ownerId` — the one person responsible for it at
its **current stage**. It is display-only: the state machine, not
ownership, decides who may act, so a case never gets stuck behind an
absent owner. Anyone in the right role can still approve, reject or query.

### Allowed actions

`GET /applications` and `GET /applications/:id` attach `allowedActions` to each
application: what the signed-in viewer can do with it right now, so the
frontend doesn't copy the workflow rules. `workflow/allowed-actions.ts` is
pure (no Prisma/env/Express) and builds the list from
`actionsFrom(status, role)` in the state machine, so it reads the same
TRANSITIONS table `applyAction()` enforces and can't drift from it (a unit
test checks this for every role and status). It adds `withdraw` (permission
`application:withdraw`) and `reassign` (current owner or `application:assign`,
only where a person owns the stage), and limits Sales-only actions to the
creator. It's a hint: every endpoint still enforces its own rules.

### Case-owner rules

The rules are pure (`utils/assignment.ts`, unit-tested, same convention as
`roles.ts`/`pagination.ts`):
- `ownerTargetForStatus()` — which role owns each resting status
  (`HOD_IN_REVIEW`→hod, `CREDIT_IN_REVIEW`→credit_review, `IC_IN_REVIEW`→
  internal_control, `PENDING_MD`→md, `PENDING_DISBURSEMENT`→finance). A
  query hands the case to whoever must answer it (`HOD_QUERY`→the Sales
  creator, `CREDIT_QUERY`→hod, `IC_QUERY`→credit_review). Drafts belong to
  their creator. Closed statuses have no owner (`ownerId` is cleared).
- `pickAssignee()` — least-loaded eligible user wins; ties go to whoever was
  assigned a case longest ago. Stateless: no stored "whose turn" pointer.
- `assigneeProblem()` — validates a manual reassignment.

`services/assignment-service.ts` does the database side. `chooseOwnerId()`
is called **inside the same transaction as every status change**
(`executeDecision()` in approval-service, plus submit and withdraw in
application-service), so status and owner can't drift apart. It prefers
whoever from the target role already handled this case, so a query comes
back to the reviewer who raised it; otherwise it picks the least-loaded
active user in that role. With nobody eligible the owner is simply `null`
and the case is still actionable. Each assignment to a person writes a row
to `case_assignments` (the history); automatic ones have `assignedById:
null`.

**Manual override** (`POST /applications/:id/assign`,
`services/reassignment-service.ts`): the current owner can hand the case to
a colleague, and an admin (`application:assign`) can reassign any case.
The new owner must be an active user in the stage's role. The creator-owned
statuses (draft, `HOD_QUERY`) can't be reassigned. It lives in its own
service file because it reads through `getApplicationById()` for visibility
scoping, which would otherwise make `application-service` and
`assignment-service` import each other.

Cases created before this feature have no owner until their next status
change; an admin can set one with the assign endpoint.

## User management

`POST/GET /admin/users`, `GET/PATCH /admin/users/:id`, `POST
/admin/users/:id/reset-password` — all gated on `admin:users` (already
assigned to `admin`, unused until now, same situation disbursement's
`disbursement:record` was in). Lives in `admin-service.ts`/
`admin-controller.ts`/`admin-routes.ts`, following the same thin-controller
pattern as everything else. No separate `admin` schema or table — it's
plain CRUD over the existing `User` model.

An admin sets a user's initial/new password directly in the request —
there's no email/SMS delivery infrastructure in this system, so a
system-generated password would still have to be relayed to the user
out-of-band by the same admin anyway. `passwordHash` is never returned by
any of these endpoints (`toSafeUser()` strips it before the response
leaves the service layer, not at the controller).

Users no longer carry a branch requirement. (It used to be enforced by
`roleRequiresBranch()`, which guarded against a branch-scoped user with no
branch seeing nothing; with branch scoping gone that failure mode no longer
exists.) `User.branch` remains as an unused column so existing data is
untouched; the admin endpoints tolerate and ignore a leftover `branch`
field.

An admin cannot deactivate their own account or change their own role away
from `admin`, via either endpoint — `403`, not silently ignored — because
a single-admin setup could otherwise lock itself out with no way back
short of a direct database edit. A second admin account is unaffected by
this restriction and can do either to the first.

## Documents

Stored on local disk under `FILE_STORAGE_DIR` (default `./uploads`,
git-ignored), behind a three-function interface (`saveFile`/`getFile`/
`deleteFile` in `utils/file-storage.ts`) — a later move to S3-compatible
storage is a new implementation of those three functions, not a rewrite of
anything that calls them. Filenames on disk are random UUIDs, never the
uploaded filename, so there's no path-traversal or collision risk; the
original filename is kept separately in the database for display.

Two layers check an upload's type: the multer `fileFilter` in
`upload-middleware.ts` rejects anything whose *declared* `Content-Type`
isn't PDF/JPEG/PNG (cheap, runs before the body is buffered), and
`uploadDocument()` then confirms the file's *actual leading bytes* match
that declared type via `detectFileType()`/`contentMatchesDeclaredType()`
in `utils/file-signature.ts` — pure and unit-tested, same convention as
`roles.ts`/`pagination.ts`. The first layer alone is spoofable by any
client; the second is what stops a renamed text file.

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
3. ~~No status/branch filtering or pagination on `GET /applications`.~~
   **Fixed.** The `status` query param narrows the result on top of
   the caller's own visibility scope (a `branch` filter existed briefly and
   was removed with branch scoping); `page`/`limit` paginate (default
   `20`, capped `100`). Response shape changed from a bare array to
   `{ data, pagination }` — see `docs/BACKEND_REFERENCE.md` §3. Case-owner
   assignment has since been built (see "Case owner" above).
4. ~~Document upload trusts the declared MIME type.~~ **Fixed.**
   `document-service.ts` now checks the file's leading bytes against the
   declared type (`utils/file-signature.ts`) and rejects a mismatch with
   `422` — a renamed text file no longer gets through. Remaining limit:
   this proves the file *starts* like a PDF/JPG/PNG, not that the whole
   file is valid or safe; it is not malware scanning.
5. ~~CORS allows any origin.~~ **Fixed.** `CORS_ALLOWED_ORIGINS` (env var,
   `config/cors.ts` + `app.ts`) restricts it to a specific comma-separated
   list of origins. Unset, or set to `*`, still allows any origin — the
   default, so local dev and the ngrok tunnel keep working unchanged —
   but it's now a one-line env change to lock down before any real
   deployment, not a code change.
6. ~~No login-attempt throttling on `/auth/login`.~~ **Fixed.** A
   sliding-window limiter (`utils/login-throttle.ts`, pure and
   unit-tested; Express glue in `middleware/login-throttle-middleware.ts`)
   allows `LOGIN_MAX_ATTEMPTS` (default 5) per `LOGIN_WINDOW_MINUTES`
   (default 15) for each IP + email pair, then answers `429
   TOO_MANY_REQUESTS` with a `Retry-After` header. The attempt is counted
   *before* the password is checked, so a burst of parallel requests
   can't slip past; blocked attempts aren't counted, so hammering doesn't
   extend a lockout; a successful login clears the count. Malformed
   requests (422) never reach it. **Remaining limit:** state is in
   process memory — it resets on restart and isn't shared between server
   instances; fine for the current single instance, a multi-instance
   deployment would need a shared store (e.g. Redis). Behind a reverse
   proxy or tunnel (ngrok), set `TRUST_PROXY_HOPS`, otherwise every
   client appears to share the proxy's IP. (Password reset being
   admin-only, via `/admin/users/:id/reset-password`, is deliberate — not
   a gap — there's no self-service password change by design.)
7. **Test coverage is auth-gating only for most new endpoints** (confirms a
   401 with no token) plus unit tests for the state machine, roles, and file
   storage. The full multi-stage workflow was verified by hand against a
   real database, not by an automated end-to-end test — there's a real gap
   between "the code was exercised" and "there's a regression test."
8. ~~`bcrypt`'s dependency chain has known vulnerabilities.~~ **Fixed.**
   Bumped to `bcrypt@6`, which drops `node-pre-gyp` (the source of the
   `tar` vulnerabilities) entirely in favor of prebuilt binaries via
   `node-gyp-build`. `hash`/`compare` — the only two functions this
   codebase calls — are unchanged across the major version; verified with
   the full build + test suite. `npm audit` still reports vulnerabilities,
   but every one left traces through `jest`/`ts-node-dev` — devDependencies
   only, never part of `npm start`/`dist/server.js`, not reachable from
   request handling. Fixing those means a `jest@30` major bump, which risks
   breaking `ts-jest`/the test config for zero actual production exposure
   — not worth it right now.

## What's not built at all

PDF export, reports. (A separate, dedicated audit-log endpoint is
deliberately not built — the `Approval` table already is the audit
trail for who approved/rejected/queried what, and when; that was
confirmed sufficient rather than left open.)
