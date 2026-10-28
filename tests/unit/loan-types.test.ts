import { LOAN_TYPES } from "../../src/config/loan-types";

describe("LOAN_TYPES", () => {
  it("contains exactly the 8 approved loan types, in order", () => {
    expect([...LOAN_TYPES]).toEqual([
      "Business/Working Capital",
      "Lease/Asset Finance",
      "Nigeria Custom Service Business",
      "SFL Travel Advance",
      "Payroll Federal FCT",
      "Payroll Federal Police",
      "Personal/Payday Loan",
      "Self-School Educational Loan Fund",
    ]);
  });

  it("has no duplicates", () => {
    expect(new Set(LOAN_TYPES).size).toBe(LOAN_TYPES.length);
  });
});
