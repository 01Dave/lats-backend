import { prisma } from "../db/client";
import { RoleName } from "../config/roles";
import { ApplicationStatus } from "../workflow/statuses";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors";
import { assigneeProblem, isReassignable } from "../utils/assignment";
import { getApplicationById } from "./application-service";
import { recordAssignment, Tx } from "./assignment-service";

/**
 * Manual override. The current owner can hand their case to a colleague;
 * an admin can reassign any case (e.g. the owner is on leave). The new
 * owner must be an active user in the role this stage belongs to.
 * Display only — it
 * changes who the case is shown against, never who is allowed to act.
 */
export async function reassignCase(actor: AuthenticatedUser, applicationId: string, assigneeId: string) {
  // Enforces visibility scope first, so an out-of-scope id is a 404.
  const application = await getApplicationById(actor, applicationId);
  const status = application.status as ApplicationStatus;

  const isAdmin = actor.permissions.includes("application:assign");
  if (!isAdmin && application.ownerId !== actor.id) {
    throw new ForbiddenError("Only the current owner or an admin can reassign this case");
  }
  if (!isReassignable(status)) {
    throw new ConflictError("This application's owner can't be reassigned at its current status");
  }
  if (application.ownerId === assigneeId) {
    throw new ConflictError("That user already owns this case");
  }

  const assignee = await prisma.user.findUnique({
    where: { id: assigneeId },
    select: { id: true, role: true, active: true },
  });
  if (!assignee) {
    throw new NotFoundError("Assignee not found");
  }
  const problem = assigneeProblem({
    status,
    assignee: { role: assignee.role as RoleName, active: assignee.active },
  });
  if (problem) {
    throw new ValidationError(problem);
  }

  return prisma.$transaction(async (tx: Tx) => {
    const updated = await tx.application.update({
      where: { id: applicationId },
      data: { ownerId: assignee.id },
      include: { owner: { select: { id: true, name: true, role: true } } },
    });
    await recordAssignment(tx, { applicationId, assigneeId: assignee.id, assignedById: actor.id, status });
    return updated;
  });
}

/** Assignment history for one application, oldest first. Visibility-scoped. */
export async function listAssignments(actor: AuthenticatedUser, applicationId: string) {
  await getApplicationById(actor, applicationId);
  return prisma.assignment.findMany({
    where: { applicationId },
    orderBy: { createdAt: "asc" },
    include: {
      assignee: { select: { id: true, name: true, role: true } },
      assignedBy: { select: { id: true, name: true, role: true } },
    },
  });
}
