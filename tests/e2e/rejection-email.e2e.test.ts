/**
 * End-to-end test of the rejection email: a real mail server runs inside the
 * test, the app is pointed at it, and a case is rejected at each of the four
 * stages. Checks the right email reaches the Sales officer who started the
 * loan, that withdrawing sends nothing, and that a dead mail server never
 * stops a rejection from being saved.
 *
 * Like the workflow e2e test: needs a seeded database, cleans up after
 * itself, and runs with `npm run test:e2e`.
 */
import { AddressInfo } from "net";
import request from "supertest";
import type { Express } from "express";
import type { PrismaClient } from "@prisma/client";
import { SMTPServer } from "smtp-server";

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
} as const;
type Who = keyof typeof EMAILS;

let app: Express;
let prisma: PrismaClient;
let smtp: SMTPServer;
let smtpClosed = false;
const inbox: string[] = [];
const tokens = {} as Record<Who, string>;
const createdIds: string[] = [];

function call(who: Who) {
  const auth = { Authorization: `Bearer ${tokens[who]}` };
  return {
    post: (path: string, body: object = {}) => request(app).post(BASE + path).set(auth).send(body),
  };
}

// Undo the line-wrapping nodemailer may apply, so assertions can match plain text.
const plain = (raw: string) => raw.replace(/=\r?\n/g, "").replace(/=3D/g, "=");

async function waitForEmails(count: number, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (inbox.length < count && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
}

async function draftAndSubmit(): Promise<string> {
  const created = await call("sales").post("/applications", {
    productName: "Personal/Payday Loan",
    customerName: "E2E Mail Customer",
    customerPhone: "08000000000",
    requestedAmount: 125000,
    tenorMonths: 6,
    purpose: "School fees",
  });
  expect(created.status).toBe(201);
  const id = created.body.id as string;
  createdIds.push(id);
  expect((await call("sales").post(`/applications/${id}/submit`)).status).toBe(200);
  return id;
}

beforeAll(async () => {
  smtp = new SMTPServer({
    secure: false,
    authOptional: true,
    disabledCommands: ["STARTTLS", "AUTH"],
    onData(stream, _session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        inbox.push(plain(Buffer.concat(chunks).toString("utf8")));
        callback();
      });
    },
  });
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", () => resolve()));

  // Point the app at the test mail server BEFORE it is loaded (env is read at import).
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String((smtp.server.address() as AddressInfo).port);
  process.env.MAIL_FROM = "LATS <lats-noreply@bank.test>";
  // Blank (not deleted) so a real SMTP_USER/SMTP_PASSWORD in .env can't be
  // loaded over the top of them by dotenv when the app starts.
  process.env.SMTP_USER = "";
  process.env.SMTP_PASSWORD = "";
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_ALLOW_INVALID_CERT = "false";

  const { createApp } = await import("../../src/app");
  ({ prisma } = await import("../../src/db/client"));
  app = createApp();

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
  if (!smtpClosed) {
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
  }
}, 60000);

describe("rejection email to the loan's initiator", () => {
  it("HOD reject emails the Sales officer", async () => {
    const id = await draftAndSubmit();
    const res = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "reject", comment: "Customer fails basic criteria" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("HOD_REJECTED");

    await waitForEmails(1);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toContain("To: sales@lats.test");
    expect(inbox[0]).toContain("Subject: Loan application");
    expect(inbox[0]).toContain("rejected at Head of Department");
    expect(inbox[0]).toContain("Customer fails basic criteria");
    expect(inbox[0]).toContain("E2E Mail Customer");
    expect(inbox[0]).toContain("125,000");
    expect(inbox[0]).toContain("Test HOD");
  });

  it("Credit Review decline emails the Sales officer", async () => {
    const id = await draftAndSubmit();
    await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve", kycConfirmed: true });
    const res = await call("credit").post(`/applications/${id}/credit-decision`, { decision: "decline", comment: "Insufficient repayment capacity" });
    expect(res.body.status).toBe("CREDIT_DECLINED");

    await waitForEmails(2);
    expect(inbox).toHaveLength(2);
    expect(inbox[1]).toContain("To: sales@lats.test");
    expect(inbox[1]).toContain("declined at Credit Review");
    expect(inbox[1]).toContain("Insufficient repayment capacity");
  });

  it("Internal Control reject emails the Sales officer", async () => {
    const id = await draftAndSubmit();
    await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve", kycConfirmed: true });
    await call("credit").post(`/applications/${id}/credit-decision`, { decision: "approve" });
    const res = await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "reject", comment: "Failed internal checks" });
    expect(res.body.status).toBe("IC_REJECTED");

    await waitForEmails(3);
    expect(inbox).toHaveLength(3);
    expect(inbox[2]).toContain("To: sales@lats.test");
    expect(inbox[2]).toContain("rejected at Internal Control");
    expect(inbox[2]).toContain("Failed internal checks");
  });

  it("MD reject emails the Sales officer", async () => {
    const id = await draftAndSubmit();
    await call("hod").post(`/applications/${id}/hod-decision`, { decision: "approve", kycConfirmed: true });
    await call("credit").post(`/applications/${id}/credit-decision`, { decision: "approve" });
    await call("ic").post(`/applications/${id}/internal-control-decision`, { decision: "approve" });
    const res = await call("md").post(`/applications/${id}/md-decision`, { decision: "reject", comment: "Outside risk appetite" });
    expect(res.body.status).toBe("MD_REJECTED");

    await waitForEmails(4);
    expect(inbox).toHaveLength(4);
    expect(inbox[3]).toContain("To: sales@lats.test");
    expect(inbox[3]).toContain("rejected at Managing Director");
    expect(inbox[3]).toContain("Outside risk appetite");
  });

  it("sends nothing for a query, an approval or a withdrawal", async () => {
    const before = inbox.length;
    const id = await draftAndSubmit();
    await call("hod").post(`/applications/${id}/hod-decision`, { decision: "query", comment: "Check address" });
    await call("sales").post(`/applications/${id}/resolve-query`, { comment: "Confirmed" });
    const wd = await call("sales").post(`/applications/${id}/withdraw`, { comment: "Customer changed their mind" });
    expect(wd.body.status).toBe("WITHDRAWN");

    await new Promise((r) => setTimeout(r, 1500));
    expect(inbox).toHaveLength(before);
  });

  it("still saves the rejection when the mail server is down", async () => {
    await new Promise<void>((resolve) => smtp.close(() => resolve()));
    smtpClosed = true;

    const id = await draftAndSubmit();
    const res = await call("hod").post(`/applications/${id}/hod-decision`, { decision: "reject", comment: "Rejected while mail is down" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("HOD_REJECTED");

    const saved = await prisma.application.findUnique({ where: { id } });
    expect(saved?.status).toBe("HOD_REJECTED");
    expect(saved?.ownerId).toBeNull();

    // Give the failed send a moment to be attempted and logged.
    await new Promise((r) => setTimeout(r, 1000));
  }, 30000);
});
