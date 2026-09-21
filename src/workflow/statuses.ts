/**
 * Application status enum — must stay in sync with the `ApplicationStatus`
 * enum in prisma/schema.prisma, and with Section 6.1 of the spec.
 */
export type ApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "HOD_IN_REVIEW"
  | "HOD_QUERY"
  | "HOD_APPROVED"
  | "CREDIT_IN_REVIEW"
  | "CREDIT_QUERY"
  | "CREDIT_APPROVED"
  | "CREDIT_DECLINED"
  | "IC_IN_REVIEW"
  | "IC_QUERY"
  | "IC_APPROVED"
  | "IC_REJECTED"
  | "PENDING_MD"
  | "MD_APPROVED"
  | "MD_REJECTED"
  | "PENDING_DISBURSEMENT"
  | "DISBURSED"
  | "WITHDRAWN";

/** Statuses with no further transitions out of them (Section 6.1 "(closed)"). */
export const CLOSED_STATUSES: ReadonlySet<ApplicationStatus> = new Set([
  "CREDIT_DECLINED",
  "IC_REJECTED",
  "MD_REJECTED",
  "DISBURSED",
  "WITHDRAWN",
]);

export function isClosed(status: ApplicationStatus): boolean {
  return CLOSED_STATUSES.has(status);
}
