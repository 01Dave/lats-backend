# LATS Backend Reference

Base URL: `http://localhost:4000/api/v1` (local dev). `/health` is the one
exception, mounted at the server root.

**Implemented:** auth, application create/edit(draft-only)/list(filtered,
paginated)/get/submit/withdraw, the four approval-decision endpoints
(including HOD reject), disbursement, query resolution, approval
history, comments, document upload/verify/download, admin user management,
case-owner assignment and reassignment.

**Not implemented:** editing an application once it's past DRAFT (including
after a query response), reports.
(Self-service password change is deliberately out of scope —
password reset is admin-only by design, via
`POST /admin/users/:id/reset-password`. A separate audit-log endpoint is
likewise deliberately not built — the `Approval` table, queryable via
`GET /applications/:id/approvals`, already is the audit trail for who
approved/rejected/queried what and when; confirmed sufficient.)

Everything in this doc has been run against a real database with real HTTP
calls, not just read from the code — see the numbered notes in §9 for the
handful of things that haven't been exercised that way yet.

---

## 1. Scope — what this system is

LATS is a digital tracker for a process that stays physical/paper-based for
identity and KYC. There is no BVN, no customer record, no product catalog,
and no digital KYC checklist. `productName` and `customerName`/`customerPhone`
are plain text on the application — nothing else references them. KYC is
confirmed by HOD as a single flag on their approval, not a checklist.

---

## 2. Auth

**POST `/auth/login`**
```json
{ "email": "sales@lats.test", "password": "Password123!" }
```
→ `200`
```json
{
  "token": "eyJ...",
  "expiresIn": "12h",
  "user": { "id": "uuid", "email": "...", "name": "...", "role": "sales", "permissions": ["..."] }
}
```

Other responses: `401 INVALID_CREDENTIALS`, `422` (malformed body),
`423 ACCOUNT_INACTIVE` (correct password, deactivated account), and
`429 TOO_MANY_REQUESTS` after too many attempts for the same IP + email:
```json
{ "code": "TOO_MANY_REQUESTS", "message": "Too many login attempts. Try again in 12 minutes." }
```
with a `Retry-After` header (seconds). Default limit is 5 attempts per 15
minutes; a successful login resets the count. The frontend should show the
message and disable the form for `Retry-After` seconds.

**GET `/auth/me`** → the same `user` object as login, including `name`: `{ "id", "email", "name", "role", "permissions" }`.

---

## 3. Applications

**POST `/applications`** — requires `application:create` (Sales)
```json
{
  "productName": "Business/Working Capital",
  "customerName": "Jane Doe",
  "customerPhone": "+2110000000",
  "requestedAmount": 50000,
  "tenorMonths": 12,
  "purpose": "Inventory"
}
```
→ `201`, full `Application` object, status `DRAFT`.

**There is no `branch` field any more** — the bank is single-branch. Don't
send it. (If you still do, it's silently ignored, not rejected, so the
frontend and backend can be updated in either order.) The response still
contains `branch`, always `"Main"`; ignore it.

**Validation rules** (`422 VALIDATION_ERROR` when broken; the same rules
apply to `PATCH /applications/:id`):

| Field | Rule |
|---|---|
| `productName` | Must be exactly one of the 8 approved loan types — load them from `GET /meta/loan-types` (below) for the dropdown. Case-sensitive. |
| `purpose` | Letters and single spaces between words only. No digits or symbols (`"Stock 2026"`, `"R&D"`, `"a-b"` are rejected). Leading/trailing spaces are trimmed. |
| `requestedAmount` | Any number above zero. **No minimum or maximum** — Sales treats the amount as flexible. |
| `tenorMonths` | Any whole number above zero. **No upper limit.** |
| `customerName`, `customerPhone` | Any non-empty text. |

The error message names the problem, e.g. `purpose may only contain letters
and single spaces between words` or `productName must be one of: ...`, so
you can show it as-is.

**GET `/meta/loan-types`** — any signed-in user. The approved loan types, in
display order, for the dropdown:
```json
{ "data": ["Business/Working Capital", "Lease/Asset Finance", "Nigeria Custom Service Business", "SFL Travel Advance", "Payroll Federal FCT", "Payroll Federal Police", "Personal/Payday Loan", "Self-School Educational Loan Fund"] }
```
Applications created before this rule keep whatever free text they were
created with; the rule applies when you create or edit one.

**GET `/applications`** — scoped by permission (see §5). Includes
`kycConfirmed`/`kycConfirmedById`/`kycConfirmedAt` on every row.

Optional query params, all combinable: `status` (exact match, any real
`ApplicationStatus` value — invalid values get `422`), `page` (default `1`),
`limit` (default `20`, capped at `100`), `owner` (`me` returns only the cases
you currently own — a personal work queue; any other value gets `422`). `status` narrows the result on top
of your own visibility scope — it can only make the list smaller, never show
you something outside it. Scope: **Sales see only the applications they
created; every other role sees all applications.** (The old `branch` filter
is gone; sending it is harmless, it's ignored.)

**Response shape changed** (breaking, from a previous version of this
doc/endpoint that returned a bare array):

```json
{
  "data": [ { "id": "...", "status": "HOD_IN_REVIEW", ... }, ... ],
  "pagination": { "page": 1, "limit": 20, "total": 47, "totalPages": 3 }
}
```

**GET `/applications/:id`** — same shape. Outside your visibility scope → `404`, not `403`.

`GET /applications` and `GET /applications/:id` also include an `owner` object (`{ id, name, role }`, or `null`) alongside `ownerId`. Responses from the action endpoints (submit, decisions, withdraw) include `ownerId` only — refetch the application if you need the owner's name.

**`allowedActions`.** `GET /applications` (every item) and `GET /applications/:id` also include `allowedActions`: an array of what the signed-in user can do with that case right now, so you can show or hide buttons without copying the workflow rules. It is an empty array for closed cases and for roles with nothing to do at that stage. It's a hint only — the endpoints enforce every rule themselves — and it's computed per viewer, so don't cache it across users. Action endpoints don't return it; refetch the application after an action.

| Value | Meaning | Call |
|---|---|---|
| `submit` | send the draft to HOD | `POST /applications/:id/submit` |
| `hod_approve`, `hod_query`, `hod_reject` | HOD decision | `POST …/hod-decision` with `decision` `approve` (needs `kycConfirmed: true`), `query` or `reject` |
| `credit_approve`, `credit_query`, `credit_decline` | Credit Review decision | `POST …/credit-decision` with `decision` `approve`, `query` or `decline` |
| `ic_approve`, `ic_query`, `ic_reject` | Internal Control decision | `POST …/internal-control-decision` with `decision` `approve`, `query` or `reject` |
| `md_approve`, `md_reject` | MD decision | `POST …/md-decision` with `decision` `approve` or `reject` |
| `finance_disburse` | record the disbursement | `POST …/disburse` |
| `hod_resolve`, `credit_resolve`, `ic_resolve` | answer a query | `POST …/resolve-query` with `comment` (one endpoint for all three) |
| `withdraw` | withdraw the case | `POST …/withdraw` with `comment` |
| `reassign` | change the display owner | `POST …/assign` with `assigneeId` |

Sales users only see `submit` and the resolve action on cases they created. `reassign` appears for the case's current owner and for admins, and only where a person owns the stage (not drafts or `HOD_QUERY`).

**Case owner.** Every application has one owner: the person responsible for it at its current stage. It is assigned automatically whenever the status changes, and is **display-only** — it never limits who may act; anyone in the right role can still approve, reject or query. Use it to show "Assigned to Ada" on a case and `GET /applications?owner=me` for a personal queue.

| Status | Owner |
|---|---|
| `DRAFT`, `HOD_QUERY` | the Sales user who created it |
| `HOD_IN_REVIEW`, `CREDIT_QUERY` | an HOD |
| `CREDIT_IN_REVIEW`, `IC_QUERY` | a Credit Review user |
| `IC_IN_REVIEW` | an Internal Control user |
| `PENDING_MD` | an MD |
| `PENDING_DISBURSEMENT` | a Finance user |
| any closed status | nobody (`null`) |

Automatic assignment picks the active user in that role with the fewest cases currently owned (ties: whoever was assigned longest ago), and a query returns to the same reviewer who raised it. If no one is eligible, `owner` is `null` and the case can still be actioned. Applications that existed before this feature have no owner until their next status change.

**POST `/applications/:id/assign`** — reassign the owner. Allowed for the current owner or an admin (`application:assign`); anyone else gets `403`.
```json
{ "assigneeId": "uuid" }
```
→ `200`, the application with its new `owner`. `422` if the user is deactivated or has the wrong role for this stage; `409` if the case is at a status whose owner can't be reassigned (draft, `HOD_QUERY`, closed) or the user already owns it; `404` if the assignee doesn't exist.

**GET `/applications/:id/assignments`** — who has held the case and when, oldest first:
```json
[ { "id": "uuid", "status": "HOD_IN_REVIEW", "assignee": { "id": "uuid", "name": "Test HOD", "role": "hod" }, "assignedBy": null, "createdAt": "..." } ]
```
`assignedBy` is `null` for automatic assignment, otherwise the person who reassigned it.

**POST `/applications/:id/submit`** — Sales only, must be the creator. No body. Returns `HOD_IN_REVIEW` directly (see §4).

**POST `/applications/:id/withdraw`** — requires `application:withdraw`.
```json
{ "comment": "reason" }
```
→ status `WITHDRAWN`, and the comment is saved to the approval history (§5 — `stage: "WITHDRAWAL"`, `decision: "WITHDRAW"`).

**PATCH `/applications/:id`** — Sales only, and only the user who created it. Only while `status: "DRAFT"` — attempting this on any other status returns `409 CONFLICT`. All fields optional; send only what's changing.
```json
{ "requestedAmount": 55000, "purpose": "Inventory and equipment" }
```
→ `200`, full updated `Application`.

**Still not implemented:** editing an application once it's past `DRAFT` — including after a query response. A query is still only answered with a comment via `resolve-query`; the underlying fields can't be corrected mid-review. If "fix and resubmit after a query" turns out to be needed, that's a separate, not-yet-designed feature — flag it if it blocks you.

**Application fields:**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `appNumber` | string | `LN-{YYYY}-{6-digit sequence}` |
| `status` | enum | see §4 |
| `productName` | string | one of the 8 loan types — see `GET /meta/loan-types` |
| `customerName`, `customerPhone`, `purpose` | string | `purpose` is letters and spaces only |
| `branch` | string | always `"Main"` (single-branch bank); not an input, ignore it |
| `ownerId` | uuid, nullable | current case owner, see above |
| `owner` | object, nullable | `{ id, name, role }` — on GET responses only |
| `allowedActions` | string[] | what the signed-in user can do now, see above — on GET responses only |
| `requestedAmount` | string | decimal serialised as a string, e.g. `"50000"` — parse before doing math |
| `tenorMonths` | integer | |
| `kycConfirmed` | boolean | set by HOD's approval, see §5 |
| `kycConfirmedById`, `kycConfirmedAt` | uuid / datetime, nullable | |
| `disbursedAmount` | string, nullable | decimal serialised as a string, same as `requestedAmount` — set by disbursement, see §5a |
| `disbursementDate` | ISO 8601, nullable | supplied by Finance, not necessarily "now" |
| `disbursementMethod` | string, nullable | free text, e.g. `"Bank Transfer"` |
| `disbursementReference` | string, nullable | optional manual core-banking reference |
| `disbursedById`, `disbursedAt` | uuid / datetime, nullable | from the authenticated actor and server clock |
| `createdById` | uuid | |
| `createdAt`, `updatedAt` | ISO 8601 | |

---

## 4. Statuses and transitions

Full enum: `DRAFT, SUBMITTED, HOD_IN_REVIEW, HOD_QUERY, HOD_APPROVED, HOD_REJECTED, CREDIT_IN_REVIEW, CREDIT_QUERY, CREDIT_APPROVED, CREDIT_DECLINED, IC_IN_REVIEW, IC_QUERY, IC_APPROVED, IC_REJECTED, PENDING_MD, MD_APPROVED, MD_REJECTED, PENDING_DISBURSEMENT, DISBURSED, WITHDRAWN`

Closed (no further action): `HOD_REJECTED, CREDIT_DECLINED, IC_REJECTED, MD_REJECTED, DISBURSED, WITHDRAWN`

**`SUBMITTED`, `HOD_APPROVED`, `CREDIT_APPROVED`, `IC_APPROVED`, `MD_APPROVED` are never returned by the API.** Each one chains straight through to the next stage's `*_IN_REVIEW`/`PENDING_*` status in the same response:

| You call | You get back |
|---|---|
| submit | `HOD_IN_REVIEW` |
| HOD approve | `CREDIT_IN_REVIEW` |
| Credit Review approve | `IC_IN_REVIEW` |
| Internal Control approve | `PENDING_MD` |
| MD approve | `PENDING_DISBURSEMENT` |
| Finance disburse | `DISBURSED` |

Build status tracking around "whatever comes back is where it is now," not around every enum value appearing as a visible step.

**HOD can now reject.** Ends the case outright (`HOD_REJECTED`, closed) — same shape as Credit Review's `decline`. Added because a query alone can't handle a disqualifying problem (e.g. a fraudulent ID) that isn't something Sales can fix by resubmitting.

---

## 5. Approval decisions and history

Four endpoints, one per stage, each takes `{ decision, comment? }`:

| Endpoint | Permission | `decision` values | Comment required for |
|---|---|---|---|
| `POST /applications/:id/hod-decision` | `hod:approve` | `approve`, `query`, `reject` | `query`, `reject` |
| `POST /applications/:id/credit-decision` | `credit:review` | `approve`, `query`, `decline` | `query`, `decline` |
| `POST /applications/:id/internal-control-decision` | `control:verify` | `approve`, `query`, `reject` | `query`, `reject` |
| `POST /applications/:id/md-decision` | `approval:md` | `approve`, `reject` | `reject` |

A missing required comment returns `409 INVALID_TRANSITION`, not `422` — that rule lives in the workflow engine, not request validation, so a validation-error handler alone won't catch it.

**HOD approve additionally requires `kycConfirmed: true` in the body**, or it's rejected with `422` before the workflow is even touched. This is the entire KYC-confirmation mechanism — a checkbox on the HOD approval screen, not a separate step or endpoint.

**Resolving a query** — one endpoint for all three query states:
```
POST /applications/:id/resolve-query
{ "comment": "..." }
```
Which status it resolves is inferred automatically from where the application currently is, and so is who's allowed to call it: Sales resolves `HOD_QUERY`, HOD resolves `CREDIT_QUERY`, Credit Review resolves `IC_QUERY`. The wrong role gets `409`. Calling it when the application isn't in any query state gets `422`.

**Full history:**
```
GET /applications/:id/approvals
```
Returns every decision (including resolutions and withdrawal) in order:
```json
{ "stage": "HOD", "decision": "QUERY", "actorId": "uuid", "comment": "...", "resultingStatus": "HOD_QUERY", "createdAt": "..." }
```
`stage` is `null` **only** for query resolutions (`decision: "RESOLVE"`), because the person answering a query isn't acting as an approval stage — Sales answers an HOD query, HOD answers a Credit Review query, Credit Review answers an IC query, and one endpoint handles all three. Withdrawal has its own value (`stage: "WITHDRAWAL"`, `decision: "WITHDRAW"`). To label a resolution in a timeline, show it as "Query resolved" and use its `resultingStatus` (`HOD_IN_REVIEW`, `CREDIT_IN_REVIEW` or `IC_IN_REVIEW`) to say which stage the case went back to. This is the right source for a case-timeline view — it's a complete, ordered record of who did what and when.

---

## 5a. Disbursement

```
POST /applications/:id/disburse
```
Permission: `disbursement:record` (Finance only). Only valid from `PENDING_DISBURSEMENT`; moves straight to `DISBURSED`, which is a real resting/closed status — it is **not** auto-chained anywhere further, unlike the statuses in §4's table.

Request:
```json
{
  "disbursedAmount": 50000,
  "disbursementDate": "2026-10-08",
  "disbursementMethod": "Bank Transfer",
  "disbursementReference": "TXN-00123456",
  "comment": "Disbursed to customer's account on file"
}
```
`disbursedAmount` (positive number), `disbursementDate` (ISO date), `disbursementMethod` (free text, no fixed list) are required. `disbursementReference` and `comment` are optional — not every disbursement channel produces a reference number, and a comment is never required for this action (same `commentRequired: false` rule as every other transition, enforced by the workflow engine, not request validation). `disbursedById`/`disbursedAt` are **not** sent by the client — set server-side from the authenticated user and the server clock.

Response `200`: the full application object with the `disbursed*` fields (see §2) now populated and `status: "DISBURSED"`.

Shows up in `GET /applications/:id/approvals` like every other decision: `{ "stage": "FINANCE", "decision": "DISBURSE", ... }`.

---

## 6. Comments and documents

**Comments** — separate from the decision history above; free-standing notes.
```
GET  /applications/:id/comments
POST /applications/:id/comments   { "body": "..." }   (requires comment:create)
```

**Documents:**
```
GET   /applications/:id/documents                       (requires document:view)
POST  /applications/:id/documents                       (requires document:upload)
GET   /applications/:id/documents/:documentId            (download; requires document:view)
PATCH /applications/:id/documents/:documentId  { "status": "verified" }   (requires document:verify)
```
Upload is `multipart/form-data`: fields `file` (PDF/JPG/PNG, ≤10MB) and `docType` (free text — no fixed list, build the picker from whatever your UI wants to call things, not from anything the server defines). Re-uploading the same `docType` creates a new version and keeps the old one (`current: false`) rather than replacing it.

The file's actual content has to match the type it's declared as: the server checks the leading bytes (PDF `%PDF-`, PNG and JPEG signatures), not just the `Content-Type` header. A text file renamed to `.pdf`, or a PNG sent as `application/pdf`, gets `422 VALIDATION_ERROR`. This confirms the file *starts* like a real PDF/JPG/PNG — it is not a full validity check or virus scan.

Document status (`pending`/`verified`/`rejected`/`expired`) is set directly by whoever reviews it — it doesn't gate anything else in the workflow. `document:verify` is held by HOD, Credit Review, Internal Control, Admin — not Sales, MD, or Finance.

---

## 7. Permissions

One role per user. Gate UI on **permissions**, not role names.

| Role | Permissions |
|---|---|
| `sales` | `application:create`, `application:view:own`, `application:withdraw`, `document:upload`, `document:view`, `comment:create` |
| `hod` | `application:view:all`, `document:upload`, `document:view`, `document:verify`, `hod:approve`, `comment:create` |
| `credit_review` | `application:view:all`, `credit:review`, `credit:approve`, `document:view`, `document:verify`, `comment:create` |
| `internal_control` | `application:view:all`, `control:verify`, `control:approve`, `document:view`, `document:verify`, `comment:create` |
| `md` | `application:view:all`, `approval:md`, `document:view`, `comment:create` |
| `finance` | `application:view:all`, `disbursement:record`, `document:view` |
| `admin` | `admin:users`, `admin:config`, `application:view:all`, `application:withdraw`, `application:assign`, `document:verify` |

`application:view:all` now covers every role except Sales (who keep
`application:view:own`): there is no branch scoping because the bank is
single-branch. `application:view:branch` no longer exists — if the frontend
gates anything on it, switch to `application:view:all`.

`disbursement:record` gates `POST /applications/:id/disburse` (§5a).
`application:assign` lets an admin reassign any case owner; the current owner of a case can also reassign it without this permission (§3).
`admin:users` gates everything under `/admin/users` (§7a) — there's no
partial admin access; it's all-or-nothing in this version.

---

## 7a. User management

All endpoints below require `admin:users` (held only by `admin`). None of
them are reachable by any other role.

```
POST   /admin/users                        create
GET    /admin/users                        list all users
GET    /admin/users/:id                    get one
PATCH  /admin/users/:id                    update
POST   /admin/users/:id/reset-password     set a new password directly
```

**Create:**
```json
{
  "email": "newuser@lats.test",
  "name": "New User",
  "password": "Password123!",
  "role": "hod"
}
```
There is no `branch` field — users don't belong to a branch any more (a
leftover `branch` in the body is ignored, not rejected). `email` must be
unique — `409 CONFLICT` if it already exists. `password` minimum 8
characters. Response is the created user, `201`, **never includes
`passwordHash`** — no endpoint in this system ever returns it.

**Update** (`PATCH /admin/users/:id`), any subset of:
```json
{ "name": "...", "role": "credit_review", "active": false }
```
At least one field required.
**An admin cannot deactivate their own account or change their own role
away from `admin`** — `403`, even though they hold `admin:users` — this is
a deliberate guard against a single admin locking themselves out. A second
admin account isn't restricted from doing either to the first.

**Reset password:**
```json
POST /admin/users/:id/reset-password
{ "password": "NewPassword456!" }
```
Sets the password directly — there's no email/token flow, this is a bank-
internal tool for an admin who already has the authority to touch user
accounts. No restriction on resetting your own password this way.

**User object shape** (same for all these endpoints):
```json
{
  "id": "uuid", "email": "...", "name": "...", "role": "hod",
  "branch": null, "active": true,
  "createdAt": "...", "updatedAt": "..."
}
```

---

## 8. Errors

```json
{ "code": "SOME_CODE", "message": "..." }
```

| Status | Code | When |
|---|---|---|
| 401 | `UNAUTHENTICATED` / `INVALID_TOKEN` / `ACCOUNT_INACTIVE` | auth problem |
| 403 | `FORBIDDEN` | authenticated, missing permission |
| 404 | `NOT_FOUND` | doesn't exist, or outside your visibility scope |
| 409 | `INVALID_TRANSITION` | wrong status, wrong actor, or missing required comment |
| 422 | `VALIDATION_ERROR` | request body failed validation |
| 500 | `INTERNAL_ERROR` | unhandled |

---

## 9. Things verified end-to-end vs. read from code

Verified by actually running one application through the entire workflow against a real database: create → submit → HOD query → resolve → HOD approve with the KYC gate (both the rejection and the success case) → Credit Review approve → Internal Control approve → MD approve → `PENDING_DISBURSEMENT` → Finance disburse → `DISBURSED`, plus the approval-history dump (including the `FINANCE`/`DISBURSE` entry), a free-standing comment, a withdrawal with its comment persisted, and disbursement's role gate (`403` for the wrong role) and closed-status guard (`409` on a second attempt).

Also battle-tested against a running server in earlier rounds: the document upload content check (text file declared as PDF → `422`, a real PDF → `201`, a real PDF declared as PNG → `422`), CORS restriction (`200` with the default open setting, `403` for a disallowed origin once restricted), and `GET /applications` filtering and pagination.

The single-branch change and case-owner assignment were battle-tested against a running server: the loan-type list returned 8 values; a purpose containing digits and an unknown loan type each returned `422`; a leftover `branch` in the body was ignored and the case saved as `Main`; submitting set an HOD as owner and recorded one assignment row; a different HOD could still raise a query (ownership is display-only) and the case went to the creator; resolving it returned the case to the original HOD; `?owner=me` returned the case for its owner only and `?owner=bogus` returned `422`; reassigning gave `403` for a non-owner, `200` for the owner and for an admin, `409` when the user already owned it and `422` for the wrong role; the history listed each change with who made it; approving moved the case to a Credit Review owner and withdrawing cleared the owner.

Login throttling was battle-tested against a running server: five wrong passwords returned `401`, the sixth `429` with a `Retry-After` header, a different user was unaffected, and a correct login reset the count.

User management (§7a) was also verified end-to-end against a real database (before branch was removed from it): create succeeded (`201`), the new user logged in with the password the admin set, admin blocked from deactivating their own account (`403`) and from demoting themselves away from `admin` (`403`), list returned every user with no `passwordHash` anywhere, and reset-password invalidated the old password and the new one worked immediately.

**Not yet run, only reasoned from the code:**
- Credit Review's `query`/`decline`, Internal Control's `query`/`reject` — the *shape* is identical to HOD's and MD's, which were tested, but these specific paths haven't been called.
- `resolve-query` being rejected for the wrong role (only the correct-role path was tested).
- `allowedActions` and `name` in `GET /auth/me` — the logic is unit-tested (including a check that the hint always agrees with the state machine), but the live responses haven't been exercised against a running server yet.

---

## 10. Deployment config

**`LOGIN_MAX_ATTEMPTS`** (default `5`) and **`LOGIN_WINDOW_MINUTES`**
(default `15`) — login throttle limits, per IP + email. A set-but-invalid
value (non-integer, below 1) fails the server at boot. State is in-memory:
a restart clears all lockouts, and multiple server instances don't share it.

**`TRUST_PROXY_HOPS`** (default `0`) — number of reverse proxies in front
of the API. Leave at `0` when clients connect directly; set to `1` behind
a single proxy/tunnel such as ngrok so the throttle sees each client's real
IP instead of the proxy's.

**`CORS_ALLOWED_ORIGINS`** (env var) — comma-separated list of origins
allowed to call this API from a browser, e.g.
`"https://lats.example.com,https://lats-staging.example.com"`. Unset, or
set to `"*"`, allows any origin — the default, so local dev and the ngrok
tunnel keep working unchanged. A disallowed origin gets `403 FORBIDDEN`
(`{"code":"FORBIDDEN","message":"Origin '...' is not allowed"}`), same
error shape as everything else in §8. Set this to a real, specific list
before deploying anywhere reachable outside your own machine — it's an
env change, not a code change.
