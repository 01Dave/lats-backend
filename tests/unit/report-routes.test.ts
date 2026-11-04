/**
 * Report routes with the database replaced by a fake: checks the wiring
 * (sign-in, permission, headers, status codes) without needing Postgres.
 * The real-database run of the same endpoints is tests/e2e/reports.e2e.test.ts.
 */
process.env.DATABASE_URL = "postgresql://unused";
process.env.JWT_SECRET = "test-secret";

import jwt from "jsonwebtoken";
import request from "supertest";

const users: Record<string, { id: string; email: string; name: string; role: string; active: boolean }> = {
  sales: { id: "u-sales", email: "s@x", name: "Sales", role: "sales", active: true },
  hod: { id: "u-hod", email: "h@x", name: "Hod", role: "hod", active: true },
};
const when = new Date("2026-11-02T09:00:00Z");

jest.mock("../../src/db/client", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        Object.values(users).find((u) => u.id === where.id) ?? null),
      findMany: jest.fn(async () => []),
    },
    application: {
      findMany: jest.fn(async () => [
        {
          id: "a1", appNumber: "LATS-1", status: "HOD_IN_REVIEW", productName: "SFL Travel Advance",
          customerName: "=Evil", customerPhone: "0801", requestedAmount: { toString: () => "1000.5" },
          disbursedAmount: null, disbursementDate: null, tenorMonths: 3, purpose: "Trip",
          createdAt: when, updatedAt: when, createdBy: { name: "Sales" }, owner: { name: "Hod" },
          approvals: [], assignments: [],
        },
      ]),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "a1"
          ? {
              appNumber: "LATS-1", status: "HOD_IN_REVIEW", branch: "Main", productName: "SFL Travel Advance",
              customerName: "Ada", customerPhone: "0801", requestedAmount: { toString: () => "1000" },
              tenorMonths: 3, purpose: "Trip", createdAt: when, createdBy: { name: "Sales" }, owner: null,
              kycConfirmed: false, kycConfirmedById: null, kycConfirmedAt: null, disbursedAmount: null,
              disbursementDate: null, disbursementMethod: null, disbursementReference: null, disbursedById: null,
              disbursedAt: null, approvals: [], comments: [], assignments: [], documents: [],
            }
          : null),
    },
  },
}));

import { createApp } from "../../src/app";

const app = createApp();
const token = (who: keyof typeof users) => `Bearer ${jwt.sign({ sub: users[who].id }, "test-secret")}`;

describe("report routes (fake database)", () => {
  it.each(["/api/v1/reports/applications.csv", "/api/v1/reports/summary", "/api/v1/reports/pipeline", "/api/v1/applications/a1/pdf"])(
    "%s needs a sign-in and refuses Sales",
    async (path) => {
      expect((await request(app).get(path)).status).toBe(401);
      expect((await request(app).get(path).set("Authorization", token("sales"))).status).toBe(403);
    },
  );

  it("serves the CSV as a download with a BOM, formula guard and truncation header", async () => {
    const res = await request(app).get("/api/v1/reports/applications.csv").set("Authorization", token("hod"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="lats-applications-\d{4}-\d{2}-\d{2}\.csv"/);
    expect(res.headers["x-report-truncated"]).toBe("false");
    expect(res.text.startsWith("﻿Application number")).toBe(true);
    expect(res.text).toContain("'=Evil");
    expect(res.text).toContain("With Head of Department");
    expect(res.text).toContain('"=""0801"""');
  });

  it("returns the summary and pipeline as JSON", async () => {
    const summary = await request(app).get("/api/v1/reports/summary").set("Authorization", token("hod"));
    expect(summary.status).toBe(200);
    expect(summary.body.months[0].month).toBe("2026-11");
    const pipe = await request(app).get("/api/v1/reports/pipeline").set("Authorization", token("hod"));
    expect(pipe.status).toBe(200);
    expect(pipe.body.stages).toHaveLength(8);
    expect(pipe.body.totalOpen).toBe(1);
  });

  it("rejects bad query values with 422", async () => {
    const res = await request(app).get("/api/v1/reports/summary?from=2026-12-01&to=2026-01-01").set("Authorization", token("hod"));
    expect(res.status).toBe(422);
  });

  it("serves the case PDF, and 404 for an unknown case", async () => {
    const ok = await request(app).get("/api/v1/applications/a1/pdf").set("Authorization", token("hod")).buffer(true).parse((r, cb) => {
      const c: Buffer[] = [];
      r.on("data", (d: Buffer) => c.push(d));
      r.on("end", () => cb(null, Buffer.concat(c)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-disposition"]).toContain('filename="LATS-1.pdf"');
    expect((ok.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    expect((await request(app).get("/api/v1/applications/nope/pdf").set("Authorization", token("hod"))).status).toBe(404);
  });
});
