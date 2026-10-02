# LATS Backend Reference

Base URL: `http://localhost:4000/api/v1` (local dev). `/health` is the one
exception, mounted at the server root.

**Implemented:** auth, application create/edit(draft-only)/list/get/submit/withdraw, the four
approval-decision endpoints (including HOD reject), query resolution, approval history, comments,
document upload/verify/download.

**Not implemented:** editing an application once it's past DRAFT (including
after a query response), disbursement, a dedicated audit-log endpoint,
reports, admin/user management, filtering or pagination on the list
endpoint.

Everything in this doc has been run against a real database with real HTTP
calls, not just read from the code — see the numbered notes in §7 for the
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

**GET `/auth/me`** → same `user` shape, minus `name` (not currently returned here — known gap).

---

## 3. Applications

**POST `/applications`** — requires `application:create` (Sales)
```json
{
  "branch": "Main",
  "productName": "Working Capital",
  "customerName": "Jane Doe",
  "customerPhone": "+2110000000",
  "requestedAmount": 50000,
  "tenorMonths": 12,
  "purpose": "Inventory"
}
```
→ `201`, full `Application` object, status `DRAFT`.

**GET `/applications`** — bare array, no pagination, scoped by permission (see §5). Includes `kycConfirmed`/`kycConfirmedById`/`kycConfirmedAt` on every row.

**GET `/applications/:id`** — same shape. Outside your visibility scope → `404`, not `403`.

**POST `/applications/:id/submit`** — Sales only, must be the creator. No body. Returns `HOD_IN_REVIEW` directly (see §4).

**POST `/applications/:id/withdraw`** — requires `application:withdraw`.
```json
{ "comment": "reason" }
```
→ status `WITHDRAWN`, and the comment is saved to the approval history (§5 — `stage: null`).

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
| `branch`, `productName`, `customerName`, `customerPhone`, `purpose` | string | free text |
| `requestedAmount` | string | decimal serialised as a string, e.g. `"50000"` — parse before doing math |
| `tenorMonths` | integer | |
| `kycConfirmed` | boolean | set by HOD's approval, see §5 |
| `kycConfirmedById`, `kycConfirmedAt` | uuid / datetime, nullable | |
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
`stage` is `null` for query resolutions and for withdrawal (`stage: "WITHDRAWAL"`, `decision: "WITHDRAW"`). This is the right source for a case-timeline view — it's a complete, ordered record of who did what and when.

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

Document status (`pending`/`verified`/`rejected`/`expired`) is set directly by whoever reviews it — it doesn't gate anything else in the workflow. `document:verify` is held by HOD, Credit Review, Internal Control, Admin — not Sales, MD, or Finance.

---

## 7. Permissions

One role per user. Gate UI on **permissions**, not role names.

| Role | Permissions |
|---|---|
| `sales` | `application:create`, `application:view:own`, `application:withdraw`, `document:upload`, `document:view`, `comment:create` |
| `hod` | `application:view:branch`, `document:upload`, `document:view`, `document:verify`, `hod:approve`, `comment:create` |
| `credit_review` | `application:view:branch`, `credit:review`, `credit:approve`, `document:view`, `document:verify`, `comment:create` |
| `internal_control` | `application:view:all`, `control:verify`, `control:approve`, `document:view`, `document:verify`, `comment:create` |
| `md` | `application:view:all`, `approval:md`, `document:view`, `comment:create` |
| `finance` | `application:view:all`, `disbursement:record`, `document:view` |
| `admin` | `admin:users`, `admin:config`, `application:view:all`, `application:withdraw`, `document:verify` |

`disbursement:record` exists on `finance` already, ahead of the disbursement endpoint being built.

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

Verified by actually running one application through the entire workflow against a real database: create → submit → HOD query → resolve → HOD approve with the KYC gate (both the rejection and the success case) → Credit Review approve → Internal Control approve → MD approve → `PENDING_DISBURSEMENT`, plus the approval-history dump, a free-standing comment, and a withdrawal with its comment persisted.

**Not yet run, only reasoned from the code:**
- Credit Review's `query`/`decline`, Internal Control's `query`/`reject` — the *shape* is identical to HOD's and MD's, which were tested, but these specific paths haven't been called.
- `resolve-query` being rejected for the wrong role (only the correct-role path was tested).
- Document upload's file-type check trusts the declared content type, not the actual file bytes — a text file renamed to end in `.pdf` will be accepted.
- CORS is currently open to any origin (fine for local dev, not for a deployed environment).
