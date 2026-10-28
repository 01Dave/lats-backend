import { RoleName } from "../config/roles";
import { ApplicationStatus } from "../workflow/statuses";

/**
 * Pure rules for case-owner assignment, deliberately free of any
 * Prisma/env/Express dependency so they're independently unit-testable —
 * same convention as roles.ts / pagination.ts / login-throttle.ts. The
 * database work lives in services/assignment-service.ts.
 *
 * "Owner" means the one person responsible for the case at its current
 * stage. It is DISPLAY ONLY: anyone in the right role can still act (the
 * state machine, not ownership, decides who may act), so a case never
 * gets stuck behind an absent owner.
 */

/** "creator" = the Sales user who created the application. */
export type OwnerTarget = RoleName | "creator";

const OWNER_TARGET_BY_STATUS: Partial<Record<ApplicationStatus, OwnerTarget>> = {
  DRAFT: "creator",
  HOD_IN_REVIEW: "hod",
  // A query hands the case back to whoever must answer it (see
  // state-machine.ts: *_resolve actions).
  HOD_QUERY: "creator",
  CREDIT_IN_REVIEW: "credit_review",
  CREDIT_QUERY: "hod",
  IC_IN_REVIEW: "internal_control",
  IC_QUERY: "credit_review",
  PENDING_MD: "md",
  PENDING_DISBURSEMENT: "finance",
};

/**
 * Who should own an application in `status`. null = nobody: closed
 * statuses, and the transient auto-chained ones that are never resting
 * states.
 */
export function ownerTargetForStatus(status: ApplicationStatus): OwnerTarget | null {
  return OWNER_TARGET_BY_STATUS[status] ?? null;
}

/** Whether `status`'s owner can be set or changed by a person. The creator can't. */
export function isReassignable(status: ApplicationStatus): boolean {
  const target = ownerTargetForStatus(status);
  return target !== null && target !== "creator";
}

export interface AssigneeCandidate {
  id: string;
  /** Applications this user currently owns (closed cases have no owner). */
  openCases: number;
  /** When they were last given a case, or null if never. */
  lastAssignedAt: Date | null;
}

/**
 * Least-loaded wins; ties go to whoever was assigned a case longest ago
 * (never-assigned first), then to the lowest id so the result is
 * deterministic. Stateless: needs no stored "whose turn is it" pointer.
 * Returns null when there are no candidates.
 */
export function pickAssignee(candidates: AssigneeCandidate[]): string | null {
  if (candidates.length === 0) {
    return null;
  }
  const sorted = [...candidates].sort((a, b) => {
    if (a.openCases !== b.openCases) {
      return a.openCases - b.openCases;
    }
    const aTime = a.lastAssignedAt ? a.lastAssignedAt.getTime() : -Infinity;
    const bTime = b.lastAssignedAt ? b.lastAssignedAt.getTime() : -Infinity;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return a.id < b.id ? -1 : 1;
  });
  return sorted[0].id;
}

export interface AssigneeCheckInput {
  status: ApplicationStatus;
  assignee: { role: RoleName; active: boolean };
}

/**
 * Whether `assignee` is a valid owner for this application right now:
 * an active user in the role that owns the current stage. Returns a
 * human-readable reason when not, null when fine. (There is no branch rule —
 * the bank is single-branch.)
 */
export function assigneeProblem(input: AssigneeCheckInput): string | null {
  const target = ownerTargetForStatus(input.status);
  if (target === null || target === "creator") {
    return "This application's owner can't be reassigned at its current status";
  }
  if (!input.assignee.active) {
    return "That user is deactivated";
  }
  if (input.assignee.role !== target) {
    return `At this stage the owner must be a '${target}' user`;
  }
  return null;
}
