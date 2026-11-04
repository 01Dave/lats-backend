import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { buildCasePdf, CasePdfData } from "../../src/utils/case-pdf";

const at = new Date("2026-11-01T08:30:00Z");

const base = (over: Partial<CasePdfData> = {}): CasePdfData => ({
  appNumber: "LATS-2026-0007",
  status: "DISBURSED",
  branch: "Main",
  productName: "Business/Working Capital",
  customerName: "Ada Obi",
  customerPhone: "08012345678",
  requestedAmount: "80000",
  tenorMonths: 12,
  purpose: "Stock for shop",
  createdAt: at,
  createdByName: "Sales One",
  ownerName: null,
  kycConfirmed: true,
  kycConfirmedByName: "HOD One",
  kycConfirmedAt: at,
  disbursement: { amount: "80000", date: at, method: "Bank transfer", reference: "REF-9", byName: "Finance One", at },
  approvals: [
    { at, stage: "HOD", decision: "APPROVE", actorName: "HOD One", comment: "KYC verified", resultingStatus: "CREDIT_IN_REVIEW" },
  ],
  comments: [{ at, authorName: "Sales One", body: "Customer called today" }],
  assignments: [{ at, assigneeName: "HOD One", assignedByName: null }],
  documents: [{ docType: "National ID", filename: "id.pdf", status: "verified", version: 1, uploadedAt: at }],
  generatedAt: at,
  generatedByName: "Admin User",
  ...over,
});

/** Reads the PDF's text back with pdftotext when it is installed; otherwise skips text checks. */
function textOf(pdf: Buffer): string | null {
  const file = path.join(os.tmpdir(), `lats-case-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(file, pdf);
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } catch {
    return null;
  } finally {
    fs.rmSync(file, { force: true });
  }
}

describe("buildCasePdf", () => {
  it("produces a real PDF", async () => {
    const pdf = await buildCasePdf(base());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("includes the case details, trail, notes, owner history and documents", async () => {
    const text = textOf(await buildCasePdf(base()));
    if (text === null) {
      return; // pdftotext not installed on this machine
    }
    for (const expected of [
      "LATS-2026-0007", "Ada Obi", "Business/Working Capital", "80,000.00", "12 months",
      "KYC confirmed: Yes, by HOD One", "REF-9", "Head of Department: Approved", "KYC verified",
      "Customer called today", "assigned automatically", "National ID", "Generated", "Admin User",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("handles an unsubmitted case with nothing recorded", async () => {
    const text = textOf(
      await buildCasePdf(
        base({
          status: "DRAFT", kycConfirmed: false, kycConfirmedByName: null, kycConfirmedAt: null,
          disbursement: null, approvals: [], comments: [], assignments: [], documents: [],
        }),
      ),
    );
    if (text === null) {
      return;
    }
    expect(text).toContain("No decisions recorded yet.");
    expect(text).toContain("KYC confirmed: Not yet");
    expect(text).not.toContain("Disbursement");
  });

  it("numbers every page and adds no blank page when the trail is long", async () => {
    const approvals = Array.from({ length: 60 }, (_, i) => ({
      at, stage: "HOD", decision: "QUERY", actorName: "HOD One", comment: `Question ${i}`, resultingStatus: "HOD_QUERY",
    }));
    const text = textOf(await buildCasePdf(base({ approvals })));
    if (text === null) {
      return;
    }
    const pages = [...text.matchAll(/Page (\d+) of (\d+)/g)];
    expect(pages.length).toBeGreaterThan(1);
    expect(pages[pages.length - 1][1]).toBe(pages[pages.length - 1][2]);
    // pdftotext ends its output with a form feed, so the last split piece is always empty.
    expect(text.split("\f").slice(0, -1).filter((p) => p.trim().length === 0)).toHaveLength(0);
  });
});
