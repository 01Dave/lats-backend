/**
 * End-to-end test: drives real applications through the whole workflow via
 * HTTP against the real database, as every role, checking status, owner,
 * allowed actions and the approval trail at each step.
 *
 * NOT part of `npm test` (it needs a database with the seed users and writes
 * to it). Run it with:
 *
 *   npm run test:e2e
 *
 * Requirements: migrated database, `npm run seed` already run. Everything it
 * creates is deleted again at the end, even if a check fails. It refuses to
 * run when NODE_ENV=production.
 *
 * The checks are sequential on purpose: each step depends on the one before,
 * so if one fails, later failures in the same section are usually just
 * fallout. Fix the first failure first.
 */
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/client";

const BASE = "/api/v1";
const PASSWORD = "Password123!";

const EMAILS = {
  sales: "sales@lats.test",
  hod: "hod@lats.test",
  credit: "creditreview@lats.test",
  ic: "internalcontrol@lats.test",
  md: "md@lats.test",
  finance: "finance@lats.test",
  admin: "admin@lats.test",
} as const;
type Who = keyof typeof EMAILS;

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the end-to-end test with NODE_ENV=production");
}

const app = createApp();
const tokens = {} as Record<Who, string>;
const userIds = {} as Record<Who, string>;
const createdIds: string[] = [];

function call(who: Who) {
  const auth = { Authorization: `Bearer ${tokens[who]}` };
  return {
    get: (path: string) => request(app).get(BASE + path).set(auth),
    post: (path: string, body: object = {}) => request(app).post(BASE + path).set(auth).send(body),
  };
}

function newApplicationBody(overrides: Record<string, unknown> = {}) {
  return {
    productName: "Business/Working Capital",
    customerName: "E2E Test Customer",
    customerPhone: "08000000000",
    requestedAmount: 80000,
    tenorMonths: 12,
    purpose: "Working capital",
    ...overrides,
  };
}

async function makeDraft(): Promise<string> {
  const res = await call("sales").post("/applications", newApplicationBody());
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body.id;
}

async function fetchApp(who: Who, id: string) {
  const res = await call(who).get(`/applications/${id}`);
  expect(res.status).toBe(200);
  return res.body;
}

/** Drives a fresh application to IC_IN_REVIEW. Returns its id. */
async function newApplicationAtIc(): Promise<string> {
  const id = await makeDraft();
  expect((await call("sales").post(`/applications/${id}/submit`)).status).toBe(200);
  expect(
    (await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve", kycConfirmed: true })).status,
  ).toBe(200);
  expect((await call("credit").post(`/applications/${id}/credit-decision`, { decision: "approve" })).status).toBe(200);
  expect((await fetchApp("admin", id)).status).toBe("IC_IN_REVIEW");
  return id;
}

beforeAll(async () => {
  for (const who of Object.keys(EMAILS) as Who[]) {
    const res = await request(app).post(`${BASE}/auth/login`).send({ email: EMAILS[who], password: PASSWORD });
    if (res.status !== 200) {
      throw new Error(
        `Could not log in as ${EMAILS[who]} (status ${res.status}). Run \`npm run seed\` first, and make sure ` +
          `that user still has the seed password.`,
      );
    }
    tokens[who] = res.body.token;
    userIds[who] = res.body.user.id;
  }
}, 60000);

afterAll(async () => {
  // Remove everything this run created, children first.
  if (createdIds.length > 0) {
    const where = { applicationId: { in: createdIds } };
    await prisma.assignment.deleteMany({ where });
    await prisma.approval.deleteMany({ where });
    await prisma.comment.deleteMany({ where });
    await prisma.document.deleteMany({ where });
    await prisma.application.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
}, 60000);

describe("full approval path: draft to disbursement", () => {
  let id: string;
  let hodOwnerId: string;
  let creditOwnerId: string;

  it("rejects bad input when creating (purpose with digits, unknown loan type)", async () => {
    const badPurpose = await call("sales").post("/applications", newApplicationBody({ purpose: "Stock 2026" }));
    expect(badPurpose.status).toBe(422);
    const badType = await call("sales").post("/applications", newApplicationBody({ productName: "Something else" }));
    expect(badType.status).toBe(422);
  });

  it("creates a draft, ignores a stray branch, and gives Sales submit and withdraw", async () => {
    const res = await call("sales").post("/applications", newApplicationBody({ branch: "Anything" }));
    expect(res.status).toBe(201);
    id = res.body.id;
    createdIds.push(id);

    const app_ = await fetchApp("sales", id);
    expect(app_.status).toBe("DRAFT");
    expect(app_.branch).toBe("Main");
    expect(app_.appNumber).toMatch(/^LN-\d{4}-\d{6}$/);
    expect([...app_.allowedActions].sort()).toEqual(["submit", "withdraw"]);
    expect((await fetchApp("hod", id)).allowedActions).toEqual([]);
  });

  it("submits to the HOD, with an HOD as owner", async () => {
    const res = await call("sales").post(`/applications/${id}/submit`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("HOD_IN_REVIEW");
    const app_ = await fetchApp("sales", id);
    expect(app_.owner.role).toBe("hod");
    hodOwnerId = app_.owner.id;
  });

  it("blocks the wrong role and a missing comment at the HOD stage", async () => {
    const wrongRole = await call("credit").post(`/applications/${id}/hod-decision`, { decision: "approve" });
    expect(wrongRole.status).toBe(403);
    const noComment = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "query" });
    expect(noComment.status).toBe(409);
    expect(noComment.body.code).toBe("INVALID_TRANSITION");
  });

  it("HOD query sends the case to the creator; only Sales can answer it", async () => {
    const q = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "query", comment: "Confirm address" });
    expect(q.status).toBe(200);
    expect(q.body.status).toBe("HOD_QUERY");
    expect((await fetchApp("sales", id)).owner.id).toBe(userIds.sales);

    const wrongResolver = await call("hod").post(`/applications/${id}/resolve-query`, { comment: "I answer myself" });
    expect(wrongResolver.status).toBe(409);
  });

  it("Sales resolves and the case returns to the same HOD", async () => {
    const r = await call("sales").post(`/applications/${id}/resolve-query`, { comment: "Address confirmed" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("HOD_IN_REVIEW");
    expect((await fetchApp("sales", id)).owner.id).toBe(hodOwnerId);
  });

  it("HOD cannot approve without confirming KYC, then approves with it", async () => {
    const noKyc = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve" });
    expect(noKyc.status).toBe(422);
    const ok = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve", kycConfirmed: true });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("CREDIT_IN_REVIEW");
    const app_ = await fetchApp("admin", id);
    expect(app_.owner.role).toBe("credit_review");
    expect(app_.kycConfirmed).toBe(true);
    creditOwnerId = app_.owner.id;
  });

  it("Credit Review queries; the HOD answers; the case returns to the same reviewer", async () => {
    const q = await call("credit").post(`/applications/${id}/credit-decision`, { decision: "query", comment: "Need payslip" });
    expect(q.body.status).toBe("CREDIT_QUERY");
    expect((await fetchApp("admin", id)).owner.role).toBe("hod");

    const r = await call("hod").post(`/applications/${id}/resolve-query`, { comment: "Payslip attached" });
    expect(r.body.status).toBe("CREDIT_IN_REVIEW");
    expect((await fetchApp("admin", id)).owner.id).toBe(creditOwnerId);
  });

  it("Credit approves into Internal Control; IC queries; Credit Review answers", async () => {
    const a = await call("credit").post(`/applications/${id}/credit-decision`, { decision: "approve" });
    expect(a.body.status).toBe("IC_IN_REVIEW");
    expect((await fetchApp("admin", id)).owner.role).toBe("internal_control");

    const q = await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "query", comment: "Check guarantor" });
    expect(q.body.status).toBe("IC_QUERY");
    expect((await fetchApp("admin", id)).owner.role).toBe("credit_review");

    const r = await call("credit").post(`/applications/${id}/resolve-query`, { comment: "Guarantor verified" });
    expect(r.body.status).toBe("IC_IN_REVIEW");
  });

  it("IC approves to the MD, who approves to Finance (and Sales cannot disburse)", async () => {
    const ic = await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "approve" });
    expect(ic.body.status).toBe("PENDING_MD");
    expect((await fetchApp("admin", id)).owner.role).toBe("md");

    const md = await call("md").post(`/applications/${id}/md-decision`, { decision: "approve" });
    expect(md.body.status).toBe("PENDING_DISBURSEMENT");
    expect((await fetchApp("admin", id)).owner.role).toBe("finance");

    const salesTries = await call("sales").post(`/applications/${id}/disburse`, {
      disbursedAmount: 80000,
      disbursementDate: "2026-11-02",
      disbursementMethod: "Bank transfer",
    });
    expect(salesTries.status).toBe(403);
  });

  it("Finance disburses; the case closes with no owner and no actions", async () => {
    const res = await call("finance").post(`/applications/${id}/disburse`, {
      disbursedAmount: 80000,
      disbursementDate: "2026-11-02",
      disbursementMethod: "Bank transfer",
      disbursementReference: "E2E-REF-1",
    });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DISBURSED");

    const app_ = await fetchApp("admin", id);
    expect(app_.owner).toBeNull();
    expect(app_.disbursementMethod).toBe("Bank transfer");
    expect(app_.disbursedById).toBe(userIds.finance);
    expect(app_.allowedActions).toEqual([]);
    expect((await fetchApp("sales", id)).allowedActions).toEqual([]);
  });

  it("records the whole journey in the approval trail", async () => {
    const res = await call("admin").get(`/applications/${id}/approvals`);
    expect(res.status).toBe(200);
    const trail = res.body as Array<{ stage: string | null; decision: string }>;
    expect(trail.map((t) => t.decision)).toEqual([
      "QUERY",
      "RESOLVE",
      "APPROVE",
      "QUERY",
      "RESOLVE",
      "APPROVE",
      "QUERY",
      "RESOLVE",
      "APPROVE",
      "APPROVE",
      "DISBURSE",
    ]);
    // Resolutions have no stage of their own.
    expect(trail.filter((t) => t.decision === "RESOLVE").every((t) => t.stage === null)).toBe(true);
  });

  it("records assignment history with automatic assignments (assignedBy null)", async () => {
    const res = await call("admin").get(`/applications/${id}/assignments`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(6);
    expect(res.body.every((a: { assignedBy: unknown }) => a.assignedBy === null)).toBe(true);
  });

  it("supports comments, and lists the case for its creator", async () => {
    const add = await call("hod").post(`/applications/${id}/comments`, { body: "E2E comment" });
    expect(add.status).toBe(201);
    const list = await call("sales").get(`/applications/${id}/comments`);
    expect(list.body.some((c: { body: string }) => c.body === "E2E comment")).toBe(true);

    const mine = await call("sales").get("/applications?limit=100");
    expect(mine.body.data.some((a: { id: string }) => a.id === id)).toBe(true);
  });
});

describe("Internal Control rejection closes the case", () => {
  it("rejects with a comment, clears the owner, and blocks further action", async () => {
    const id = await newApplicationAtIc();

    const noComment = await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "reject" });
    expect(noComment.status).toBe(409);

    const rej = await call("ic").post(`/applications/${id}/internal-control-decision`, {
      decision: "reject",
      comment: "Failed internal checks",
    });
    expect(rej.status).toBe(200);
    expect(rej.body.status).toBe("IC_REJECTED");

    const app_ = await fetchApp("sales", id);
    expect(app_.owner).toBeNull();
    expect(app_.allowedActions).toEqual([]);

    const again = await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "approve" });
    expect(again.status).toBe(409);
  });
});

describe("Withdrawal and reassignment", () => {
  it("requires a reason to withdraw, then closes the case with no owner", async () => {
    const id = await makeDraft();
    await call("sales").post(`/applications/${id}/submit`);

    const noReason = await call("sales").post(`/applications/${id}/withdraw`, {});
    expect(noReason.status).toBe(422);

    const res = await call("sales").post(`/applications/${id}/withdraw`, { comment: "Customer changed their mind" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("WITHDRAWN");
    expect((await fetchApp("sales", id)).owner).toBeNull();
  });

  it("lets an admin reassign a case between HODs, and blocks a non-owner", async () => {
    const id = await makeDraft();
    await call("sales").post(`/applications/${id}/submit`);
    const before = await fetchApp("admin", id);

    // The other HOD is any active HOD who isn't the current owner.
    const other = await prisma.user.findFirst({
      where: { role: "hod", active: true, id: { not: before.owner.id } },
      select: { id: true },
    });
    if (!other) {
      throw new Error("Needs a second active HOD (the seed creates hod2@lats.test).");
    }

    const blocked = await call("credit").post(`/applications/${id}/assign`, { assigneeId: other.id });
    expect(blocked.status).toBe(403);

    const ok = await call("admin").post(`/applications/${id}/assign`, { assigneeId: other.id });
    expect(ok.status).toBe(200);
    expect((await fetchApp("admin", id)).owner.id).toBe(other.id);

    const history = await call("admin").get(`/applications/${id}/assignments`);
    const last = history.body[history.body.length - 1];
    expect(last.assignedBy.role).toBe("admin");
  });
});
