import { Permission, RoleName } from "../config/roles";
import { isReassignable } from "../utils/assignment";
import { actionsFrom, WorkflowAction } from "./state-machine";
import { ApplicationStatus, isClosed } from "./statuses";

/**
 * Everything a UI might offer on a case: the workflow actions plus
 * "reassign" (change the display owner).
 */
export type AllowedAction = WorkflowAction | "reassign";

export interface AllowedActionsInput {
  status: ApplicationStatus;
  role: RoleName;
  permissions: readonly Permission[];
  /** Whether the viewer created this application. */
  isCreator: boolean;
  /** Whether the viewer is the case's current owner. */
  isOwner: boolean;
}

/**
 * What the signed-in viewer can do with one application right now. A UI
 * hint only: the endpoints still enforce every rule themselves, so a stale
 * or ignored hint can never let a forbidden action through.
 *
 * Pure (no Prisma/env/Express) like roles.ts and assignment.ts, so it is
 * unit-testable on its own. Rules, mirroring the services:
 * - workflow actions: from the state machine's table, by role and status;
 *   anything meant for Sales (submit, resolving an HOD query) is further
 *   limited to the creator;
 * - withdraw: anyone holding application:withdraw, while the case is open;
 * - reassign: the current owner or an admin (application:assign), only at
 *   statuses where a person owns the stage.
 * Closed cases return an empty list.
 */
export function allowedActions(input: AllowedActionsInput): AllowedAction[] {
  const { status, role, permissions, isCreator, isOwner } = input;

  if (isClosed(status)) {
    return [];
  }

  const result: AllowedAction[] = actionsFrom(status, role).filter(() => role !== "sales" || isCreator);

  if (permissions.includes("application:withdraw")) {
    result.push("withdraw");
  }

  if (isReassignable(status) && (isOwner || permissions.includes("application:assign"))) {
    result.push("reassign");
  }

  return result;
}
