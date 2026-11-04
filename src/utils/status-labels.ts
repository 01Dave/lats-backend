import { ApplicationStatus } from "../workflow/statuses";

/** Human wording for statuses, decisions and stages in reports. Pure. */

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  HOD_IN_REVIEW: "With Head of Department",
  HOD_QUERY: "Query from Head of Department",
  HOD_APPROVED: "Approved by Head of Department",
  HOD_REJECTED: "Rejected by Head of Department",
  CREDIT_IN_REVIEW: "With Credit Review",
  CREDIT_QUERY: "Query from Credit Review",
  CREDIT_APPROVED: "Approved by Credit Review",
  CREDIT_DECLINED: "Declined by Credit Review",
  IC_IN_REVIEW: "With Internal Control",
  IC_QUERY: "Query from Internal Control",
  IC_APPROVED: "Approved by Internal Control",
  IC_REJECTED: "Rejected by Internal Control",
  PENDING_MD: "With Managing Director",
  MD_APPROVED: "Approved by Managing Director",
  MD_REJECTED: "Rejected by Managing Director",
  PENDING_DISBURSEMENT: "Awaiting disbursement",
  DISBURSED: "Disbursed",
  WITHDRAWN: "Withdrawn",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status as ApplicationStatus] ?? status;
}

const STAGE_LABELS: Record<string, string> = {
  HOD: "Head of Department",
  CREDIT_REVIEW: "Credit Review",
  INTERNAL_CONTROL: "Internal Control",
  MD: "Managing Director",
  FINANCE: "Finance",
  WITHDRAWAL: "Withdrawal",
};

export function stageLabel(stage: string | null): string {
  return stage ? (STAGE_LABELS[stage] ?? stage) : "";
}

const DECISION_LABELS: Record<string, string> = {
  APPROVE: "Approved",
  QUERY: "Query raised",
  DECLINE: "Declined",
  REJECT: "Rejected",
  RESOLVE: "Query answered",
  WITHDRAW: "Withdrawn",
  DISBURSE: "Disbursed",
};

export function decisionLabel(decision: string): string {
  return DECISION_LABELS[decision] ?? decision;
}
