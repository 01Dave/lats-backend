import { ApplicationStatus, isClosed } from "./statuses";
import { RoleName } from "../config/roles";

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

/**
 * One named action a user can take. Maps 1:1 to an approval endpoint.
 * `actor` is who is allowed to perform it; `system` actions are never
 * called directly by a controller — they are auto-chained (see below).
 */
export type WorkflowAction =
  | "submit"
  | "hod_query"
  | "hod_resolve"
  | "hod_approve"
  | "hod_reject"
  | "credit_query"
  | "credit_resolve"
  | "credit_approve"
  | "credit_decline"
  | "ic_query"
  | "ic_resolve"
  | "ic_approve"
  | "ic_reject"
  | "md_approve"
  | "md_reject"
  | "finance_disburse"
  | "withdraw";

interface TransitionRule {
  from: ApplicationStatus;
  to: ApplicationStatus;
  actor: RoleName | "system" | "any"; // "any" = withdraw, gated separately by application:withdraw permission
  commentRequired: boolean;
}

/**
 * Section 6.2 of the spec, encoded exactly. This is the ONLY place
 * transition rules live — services call applyAction(), never assign
 * application.status directly (coding standard).
 */
const TRANSITIONS: Record<WorkflowAction, TransitionRule> = {
  submit: { from: "DRAFT", to: "SUBMITTED", actor: "sales", commentRequired: false },
  // SUBMITTED -> HOD_IN_REVIEW is listed as HOD-actor in the spec table but has
  // no distinct HOD activity attached to it (Stage 2 activities start once
  // "in review") — treated as a system-chained transition so a submitted
  // application lands directly in the HOD's actionable queue.
  hod_query: { from: "HOD_IN_REVIEW", to: "HOD_QUERY", actor: "hod", commentRequired: true },
  hod_resolve: { from: "HOD_QUERY", to: "HOD_IN_REVIEW", actor: "sales", commentRequired: true },
  hod_approve: { from: "HOD_IN_REVIEW", to: "HOD_APPROVED", actor: "hod", commentRequired: false },
  // Ends the case outright — same shape as credit_decline/ic_reject. Added
  // per project decision: a query alone can't handle a disqualifying
  // problem (e.g. fraudulent ID) that isn't fixable by Sales resubmitting.
  hod_reject: { from: "HOD_IN_REVIEW", to: "HOD_REJECTED", actor: "hod", commentRequired: true },
  credit_query: { from: "CREDIT_IN_REVIEW", to: "CREDIT_QUERY", actor: "credit_review", commentRequired: true },
  credit_resolve: { from: "CREDIT_QUERY", to: "CREDIT_IN_REVIEW", actor: "hod", commentRequired: true },
  credit_approve: { from: "CREDIT_IN_REVIEW", to: "CREDIT_APPROVED", actor: "credit_review", commentRequired: false },
  credit_decline: { from: "CREDIT_IN_REVIEW", to: "CREDIT_DECLINED", actor: "credit_review", commentRequired: true },
  ic_query: { from: "IC_IN_REVIEW", to: "IC_QUERY", actor: "internal_control", commentRequired: true },
  ic_resolve: { from: "IC_QUERY", to: "IC_IN_REVIEW", actor: "credit_review", commentRequired: true },
  ic_approve: { from: "IC_IN_REVIEW", to: "IC_APPROVED", actor: "internal_control", commentRequired: false },
  ic_reject: { from: "IC_IN_REVIEW", to: "IC_REJECTED", actor: "internal_control", commentRequired: true },
  md_approve: { from: "PENDING_MD", to: "MD_APPROVED", actor: "md", commentRequired: false },
  md_reject: { from: "PENDING_MD", to: "MD_REJECTED", actor: "md", commentRequired: true },
  finance_disburse: { from: "PENDING_DISBURSEMENT", to: "DISBURSED", actor: "finance", commentRequired: false },
  withdraw: { from: "DRAFT" /* placeholder, checked dynamically below */, to: "WITHDRAWN", actor: "any", commentRequired: true },
};

/** System-chained transitions: applied automatically right after the row above lands. */
const SYSTEM_CHAIN: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  SUBMITTED: "HOD_IN_REVIEW",
  HOD_APPROVED: "CREDIT_IN_REVIEW",
  CREDIT_APPROVED: "IC_IN_REVIEW",
  IC_APPROVED: "PENDING_MD",
  MD_APPROVED: "PENDING_DISBURSEMENT",
};

function chainSystemTransitions(status: ApplicationStatus): ApplicationStatus {
  let current = status;
  let next = SYSTEM_CHAIN[current];
  while (next) {
    current = next;
    next = SYSTEM_CHAIN[current];
  }
  return current;
}

export interface ApplyActionParams {
  currentStatus: ApplicationStatus;
  action: WorkflowAction;
  actorRole: RoleName;
  comment?: string;
}

export interface ApplyActionResult {
  status: ApplicationStatus;
  commentRequired: boolean;
}

/**
 * Validates and applies a single named action, then auto-chains any
 * system transitions that immediately follow. Throws InvalidTransitionError
 * on any rule violation (wrong starting state, wrong actor, missing
 * required comment) — callers never need to pre-check.
 */
export function applyAction(params: ApplyActionParams): ApplyActionResult {
  const { currentStatus, action, actorRole, comment } = params;

  if (isClosed(currentStatus)) {
    throw new InvalidTransitionError(`Application in closed status ${currentStatus} cannot be transitioned`);
  }

  if (action === "withdraw") {
    // Withdraw is allowed from any non-closed status pre-disbursement (Section 6.2, "Any (pre-disbursement)").
    if (!comment || comment.trim().length === 0) {
      throw new InvalidTransitionError("A comment is required to withdraw an application");
    }
    return { status: "WITHDRAWN", commentRequired: true };
  }

  const rule = TRANSITIONS[action];

  if (rule.from !== currentStatus) {
    throw new InvalidTransitionError(`Action '${action}' is not valid from status ${currentStatus}`);
  }

  if (rule.actor !== "system" && rule.actor !== actorRole) {
    throw new InvalidTransitionError(`Action '${action}' requires role '${rule.actor}', got '${actorRole}'`);
  }

  if (rule.commentRequired && (!comment || comment.trim().length === 0)) {
    throw new InvalidTransitionError(`Action '${action}' requires a non-empty comment`);
  }

  const finalStatus = chainSystemTransitions(rule.to);

  return { status: finalStatus, commentRequired: rule.commentRequired };
}
