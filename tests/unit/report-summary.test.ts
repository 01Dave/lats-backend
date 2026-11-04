import { buildMonthlySummary, SummaryRow } from "../../src/utils/report-summary";
import { fromCents, toCents } from "../../src/utils/money";

const row = (over: Partial<SummaryRow>): SummaryRow => ({
  status: "HOD_IN_REVIEW",
  productName: "Personal/Payday Loan",
  requestedAmount: "100000",
  disbursedAmount: null,
  createdAt: new Date("2026-10-15T10:00:00Z"),
  ...over,
});

describe("money", () => {
  it("adds exactly in cents", () => {
    expect(toCents("0.10") + toCents("0.20")).toBe(30);
    expect(fromCents(toCents("80000.5"))).toBe("80000.50");
    expect(fromCents(toCents(null))).toBe("0.00");
    expect(fromCents(5)).toBe("0.05");
  });
});

describe("buildMonthlySummary", () => {
  it("returns nothing for no rows", () => {
    expect(buildMonthlySummary([])).toEqual([]);
  });

  it("counts outcomes and amounts per month, oldest month first", () => {
    const months = buildMonthlySummary([
      row({ status: "DISBURSED", requestedAmount: "80000", disbursedAmount: "75000.50" }),
      row({ status: "HOD_REJECTED" }),
      row({ status: "CREDIT_DECLINED" }),
      row({ status: "IC_REJECTED" }),
      row({ status: "MD_REJECTED" }),
      row({ status: "WITHDRAWN" }),
      row({ status: "PENDING_MD" }),
      row({ createdAt: new Date("2026-09-02T10:00:00Z") }),
    ]);
    expect(months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    const oct = months[1].total;
    expect(oct.submitted).toBe(7);
    expect(oct.disbursed).toBe(1);
    expect(oct.rejected).toBe(4);
    expect(oct.rejectedByStage).toEqual({ hod: 1, creditReview: 1, internalControl: 1, md: 1 });
    expect(oct.withdrawn).toBe(1);
    expect(oct.inProgress).toBe(1);
    expect(oct.requestedAmount).toBe("680000.00");
    expect(oct.disbursedAmount).toBe("75000.50");
  });

  it("keeps drafts out of the figures and reports them separately", () => {
    const [m] = buildMonthlySummary([row({ status: "DRAFT" }), row({ status: "DRAFT" }), row({})]);
    expect(m.drafts).toBe(2);
    expect(m.total.submitted).toBe(1);
  });

  it("splits by loan type, alphabetically, and the types add up to the total", () => {
    const [m] = buildMonthlySummary([
      row({ productName: "SFL Travel Advance" }),
      row({ productName: "Business/Working Capital" }),
      row({ productName: "Business/Working Capital", status: "DISBURSED", disbursedAmount: "5.00" }),
    ]);
    expect(m.byLoanType.map((t) => t.productName)).toEqual(["Business/Working Capital", "SFL Travel Advance"]);
    expect(m.byLoanType.reduce((n, t) => n + t.submitted, 0)).toBe(m.total.submitted);
    expect(m.byLoanType[0].disbursed).toBe(1);
  });

  it("assigns a loan to its Lagos month, not its UTC month", () => {
    const months = buildMonthlySummary([row({ createdAt: new Date("2026-10-31T23:30:00Z") })]);
    expect(months[0].month).toBe("2026-11");
  });
});
