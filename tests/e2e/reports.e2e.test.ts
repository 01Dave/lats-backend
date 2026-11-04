/**
 * End-to-end test of the reports: who may read them, and that each returns
 * sensible content for cases this run creates. Like the other e2e tests it
 * needs a seeded database, deletes everything it creates, and runs with
 * `npm run test:e2e`.
 *
 * The database may hold other loans, so figures are checked as "at least"
 * or by finding this run's own cases, never as exact totals.
 */
import request from "supertest";
import { createApp } from "../../src/app";
import { prisma } from "../../src/db/client";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run the end-to-end test with NODE_ENV=production");
}

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

const app = createApp();
const tokens = {} as Record<Who, string>;
const createdIds: string[] = [];

function call(who: Who) {
  const auth = { Authorization: `Bearer ${tokens[who]}` };
  return {
    get: (path: string) => request(app).get(BASE + path).set(auth).buffer(true).parse(binaryParser),
    post: (path: string, body: object = {}) => request(app).post(BASE + path).set(auth).send(body),
  };
}

// Keeps PDF/CSV bodies as raw bytes, and still parses JSON.
function binaryParser(res: request.Response, callback: (err: Error | null, body: unknown) => void) {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => {
    const raw = Buffer.concat(chunks);
    callback(null, (res.headers["content-type"] ?? "").includes("json") ? JSON.parse(raw.toString("utf8")) : raw);
  });
}

async function newCase(customerName: string, phone = "08011112222"): Promise<string> {
  const created = await request(app)
    .post(`${BASE}/applications`)
    .set({ Authorization: `Bearer ${tokens.sales}` })
    .send({
      productName: "Personal/Payday Loan",
      customerName,
      customerPhone: phone,
      requestedAmount: 55000,
      tenorMonths: 6,
      purpose: "Report test",
    });
  expect(created.status).toBe(201);
  createdIds.push(created.body.id);
  return created.body.id;
}

async function submit(id: string) {
  expect((await request(app).post(`${BASE}/applications/${id}/submit`).set({ Authorization: `Bearer ${tokens.sales}` })).status).toBe(200);
}

beforeAll(async () => {
  for (const who of Object.keys(EMAILS) as Who[]) {
    const res = await request(app).post(`${BASE}/auth/login`).send({ email: EMAILS[who], password: PASSWORD });
    if (res.status !== 200) {
      throw new Error(`Could not log in as ${EMAILS[who]} (status ${res.status}). Run \`npm run seed\` first.`);
    }
    tokens[who] = res.body.token;
  }
}, 60000);

afterAll(async () => {
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

let rejectedId: string;
let openId: string;
let draftId: string;

describe("report access", () => {
  it("is refused for Sales on every report, and needs a sign-in", async () => {
    for (const path of ["/reports/applications.csv", "/reports/summary", "/reports/pipeline"]) {
      expect((await call("sales").get(path)).status).toBe(403);
      expect((await request(app).get(BASE + path)).status).toBe(401);
    }
    const id = await newCase("Report Access Customer");
    expect((await call("sales").get(`/applications/${id}/pdf`)).status).toBe(403);
    expect((await request(app).get(`${BASE}/applications/${id}/pdf`)).status).toBe(401);
  });

  it("is open to every reviewer, Finance and Admin", async () => {
    for (const who of ["hod", "credit", "ic", "md", "finance", "admin"] as Who[]) {
      expect((await call(who).get("/reports/pipeline")).status).toBe(200);
    }
  });
});

describe("with a rejected case, an open case and a draft", () => {
  beforeAll(async () => {
    rejectedId = await newCase("=Rejected Customer");
    await submit(rejectedId);
    const reject = await call("hod").post(`/applications/${rejectedId}/hod-decision`, { decision: "reject", comment: "Fails basic criteria" });
    expect(reject.status).toBe(200);

    openId = await newCase("Open Report Customer");
    await submit(openId);

    draftId = await newCase("Draft Report Customer");
  }, 60000);

  it("single-case PDF downloads with the application number as its name", async () => {
    const res = await call("hod").get(`/applications/${rejectedId}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    const number = (await prisma.application.findUnique({ where: { id: rejectedId } }))!.appNumber;
    expect(res.headers["content-disposition"]).toContain(`${number}.pdf`);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("single-case PDF is 404 for an unknown case", async () => {
    expect((await call("admin").get("/applications/00000000-0000-0000-0000-000000000000/pdf")).status).toBe(404);
  });

  it("applications CSV lists this run's cases, defuses formulas, and honours filters", async () => {
    const all = await call("admin").get("/reports/applications.csv");
    expect(all.status).toBe(200);
    expect(all.headers["content-type"]).toContain("text/csv");
    expect(all.headers["content-disposition"]).toContain("lats-applications-");
    expect(all.headers["x-report-truncated"]).toBe("false");
    const text = (all.body as Buffer).toString("utf8");
    expect(text.startsWith("﻿Application number,Status,Loan type")).toBe(true);
    expect(text).toContain("'=Rejected Customer");
    expect(text).toContain("Open Report Customer");
    expect(text).toContain("Rejected by Head of Department");

    const onlyRejected = (await call("admin").get("/reports/applications.csv?status=HOD_REJECTED")).body as Buffer;
    const rejectedText = onlyRejected.toString("utf8");
    expect(rejectedText).toContain("Rejected Customer");
    expect(rejectedText).not.toContain("Open Report Customer");
  });

  it("applications CSV rejects bad filters with 422", async () => {
    expect((await call("admin").get("/reports/applications.csv?status=NOPE")).status).toBe(422);
    expect((await call("admin").get("/reports/applications.csv?from=2026-02-31")).status).toBe(422);
    expect((await call("admin").get("/reports/applications.csv?from=2026-11-05&to=2026-11-01")).status).toBe(422);
  });

  it("monthly summary counts the new cases in the current Lagos month", async () => {
    const res = await call("md").get("/reports/summary");
    expect(res.status).toBe(200);
    const body = res.body as {
      timeZone: string;
      months: Array<{ month: string; drafts: number; total: { submitted: number; rejected: number; rejectedByStage: { hod: number } } }>;
    };
    expect(body.timeZone).toBe("Africa/Lagos");
    const thisMonth = body.months[body.months.length - 1];
    expect(thisMonth.drafts).toBeGreaterThanOrEqual(1);
    expect(thisMonth.total.submitted).toBeGreaterThanOrEqual(2);
    expect(thisMonth.total.rejected).toBeGreaterThanOrEqual(1);
    expect(thisMonth.total.rejectedByStage.hod).toBeGreaterThanOrEqual(1);
  });

  it("monthly summary honours a date window and rejects a reversed one", async () => {
    const empty = await call("md").get("/reports/summary?from=2000-01-01&to=2000-01-31");
    expect((empty.body as { months: unknown[] }).months).toEqual([]);
    expect((await call("md").get("/reports/summary?from=2026-12-01&to=2026-01-01")).status).toBe(422);
  });

  it("pipeline shows the open case in HOD review and not the rejected one", async () => {
    const res = await call("finance").get("/reports/pipeline");
    expect(res.status).toBe(200);
    const body = res.body as {
      totalOpen: number;
      stages: Array<{ status: string; count: number; oldest: Array<{ id: string; daysInStage: number }> }>;
    };
    expect(body.stages.map((s) => s.status)).toContain("PENDING_DISBURSEMENT");
    const hod = body.stages.find((s) => s.status === "HOD_IN_REVIEW")!;
    expect(hod.count).toBeGreaterThanOrEqual(1);
    const everyListed = body.stages.flatMap((s) => s.oldest.map((o) => o.id));
    expect(everyListed).not.toContain(rejectedId);
    expect(everyListed).not.toContain(draftId);
    const mine = hod.oldest.find((o) => o.id === openId);
    if (mine) {
      expect(mine.daysInStage).toBeLessThan(1);
    }
  });
});
