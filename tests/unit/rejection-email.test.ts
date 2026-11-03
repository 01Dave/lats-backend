import { buildRejectionEmail, formatAmount, isRejectionStatus, RejectionEmailInput } from "../../src/utils/rejection-email";
import { ApplicationStatus } from "../../src/workflow/statuses";

const base: RejectionEmailInput = {
  status: "IC_REJECTED",
  appNumber: "LN-2026-000123",
  customerName: "Ada Obi",
  productName: "Personal/Payday Loan",
  requestedAmount: "80000",
  recipientName: "Test Sales",
  rejectedByName: "Test Internal Control",
  comment: "Failed internal checks",
};

describe("isRejectionStatus", () => {
  it("is true for all four rejecting outcomes", () => {
    for (const s of ["HOD_REJECTED", "CREDIT_DECLINED", "IC_REJECTED", "MD_REJECTED"] as ApplicationStatus[]) {
      expect(isRejectionStatus(s)).toBe(true);
    }
  });

  it("is false for everything else, including withdrawal and disbursement", () => {
    const others: ApplicationStatus[] = [
      "DRAFT",
      "HOD_IN_REVIEW",
      "HOD_QUERY",
      "CREDIT_IN_REVIEW",
      "CREDIT_QUERY",
      "IC_IN_REVIEW",
      "IC_QUERY",
      "PENDING_MD",
      "PENDING_DISBURSEMENT",
      "DISBURSED",
      "WITHDRAWN",
    ];
    for (const s of others) {
      expect(isRejectionStatus(s)).toBe(false);
    }
  });
});

describe("buildRejectionEmail", () => {
  it("names the application, stage and outcome in the subject", () => {
    expect(buildRejectionEmail(base).subject).toBe("Loan application LN-2026-000123 rejected at Internal Control");
  });

  it("covers every stage with its own wording, and says declined for Credit Review", () => {
    expect(buildRejectionEmail({ ...base, status: "HOD_REJECTED" }).subject).toContain("rejected at Head of Department");
    expect(buildRejectionEmail({ ...base, status: "CREDIT_DECLINED" }).subject).toContain("declined at Credit Review");
    expect(buildRejectionEmail({ ...base, status: "MD_REJECTED" }).subject).toContain("rejected at Managing Director");
  });

  it("includes the details, the reviewer and the reason in the plain text", () => {
    const { text } = buildRejectionEmail(base);
    expect(text).toContain("Hello Test Sales,");
    expect(text).toContain("LN-2026-000123");
    expect(text).toContain("Ada Obi");
    expect(text).toContain("Personal/Payday Loan");
    expect(text).toContain("80,000");
    expect(text).toContain("Test Internal Control (Internal Control)");
    expect(text).toContain("Failed internal checks");
  });

  it("escapes HTML in user-supplied values", () => {
    const { html } = buildRejectionEmail({
      ...base,
      customerName: "<script>alert(1)</script>",
      comment: "Line one\n<b>bold</b> & more",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more");
    expect(html).toContain("Line one<br>");
  });

  it("keeps line breaks out of the subject and greeting (no header injection)", () => {
    const e = buildRejectionEmail({ ...base, appNumber: "LN-1\r\nBcc: x@y.com", recipientName: "A\nB" });
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.text.split("\n")[0]).toBe("Hello A B,");
  });

  it("refuses a status that isn't a rejection", () => {
    expect(() => buildRejectionEmail({ ...base, status: "DISBURSED" })).toThrow("not a rejection status");
  });
});

describe("formatAmount", () => {
  it("adds thousands separators and drops empty decimals", () => {
    expect(formatAmount("80000")).toBe("80,000");
    expect(formatAmount("1250000.00")).toBe("1,250,000");
    expect(formatAmount(80000.5)).toBe("80,000.5");
  });

  it("leaves something non-numeric as given", () => {
    expect(formatAmount("n/a")).toBe("n/a");
  });
});
