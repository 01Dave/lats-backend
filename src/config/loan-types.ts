/**
 * The approved loan types. Single source of truth: the create/update
 * validators accept only these values for an application's `productName`,
 * and GET /meta/loan-types serves the same list to the frontend dropdown.
 * Free of any Prisma/env dependency so it is unit-testable (same
 * convention as roles.ts). Changing the list is a code change by design.
 */
export const LOAN_TYPES = [
  "Business/Working Capital",
  "Lease/Asset Finance",
  "Nigeria Custom Service Business",
  "SFL Travel Advance",
  "Payroll Federal FCT",
  "Payroll Federal Police",
  "Personal/Payday Loan",
  "Self-School Educational Loan Fund",
] as const;

export type LoanType = (typeof LOAN_TYPES)[number];
