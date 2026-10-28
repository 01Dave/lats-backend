import { RoleName } from "../config/roles";
import { ApplicationStatus } from "../workflow/statuses";
import { ownerTargetForStatus, pickAssignee, AssigneeCandidate } from "../utils/assignment";

/**
 * Transaction client. Explicit `any` for the same reason as the
 * $transaction callbacks in application-service.ts/approval-service.ts:
 * the sandbox's stub Prisma client can't infer it. On a machine with a
 * generated client this could be Prisma.TransactionClient.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = any;

interface CaseRef {
  id: string;
  createdById: string;
}

/**
 * Works out who should own `application` once it is in `status`.
 *
 * - Closed / transient statuses: nobody (null).
 * - Creator-owned statuses (DRAFT, HOD_QUERY): the Sales user who created it.
 * - Otherwise the role for that stage, preferring whoever from that role
 *   already handled this case earlier (so a query comes back to the same
 *   reviewer who raised it), and falling back to the least-loaded eligible
 *   user. If nobody is eligible (e.g. no active HOD at all) the
 *   result is null — the case is still actionable by anyone in the role,
 *   because ownership is display-only.
 */
export async function chooseOwnerId(tx: Tx, application: CaseRef, status: ApplicationStatus): Promise<string | null> {
  const target = ownerTargetForStatus(status);
  if (target === null) {
    return null;
  }
  if (target === "creator") {
    return application.createdById;
  }

  const previous = await tx.assignment.findFirst({
    where: { applicationId: application.id, assignee: { role: target, active: true } },
    orderBy: { createdAt: "desc" },
    select: { assigneeId: true },
  });
  if (previous) {
    return previous.assigneeId;
  }

  const users: Array<{ id: string }> = await tx.user.findMany({
    where: { role: target as RoleName, active: true },
    select: { id: true },
  });
  if (users.length === 0) {
    return null;
  }

  const ids = users.map((u) => u.id);
  const [loads, lastAssigned] = await Promise.all([
    tx.application.groupBy({ by: ["ownerId"], where: { ownerId: { in: ids } }, _count: { _all: true } }),
    tx.assignment.groupBy({ by: ["assigneeId"], where: { assigneeId: { in: ids } }, _max: { createdAt: true } }),
  ]);
  const loadById = new Map<string, number>(
    (loads as Array<{ ownerId: string; _count: { _all: number } }>).map((l) => [l.ownerId, l._count._all]),
  );
  const lastById = new Map<string, Date | null>(
    (lastAssigned as Array<{ assigneeId: string; _max: { createdAt: Date | null } }>).map((l) => [
      l.assigneeId,
      l._max.createdAt,
    ]),
  );

  const candidates: AssigneeCandidate[] = ids.map((id) => ({
    id,
    openCases: loadById.get(id) ?? 0,
    lastAssignedAt: lastById.get(id) ?? null,
  }));
  return pickAssignee(candidates);
}

/**
 * Records one history row. Call inside the same transaction as the status
 * change that caused it. `assignedById` is null for automatic assignment.
 * Creator-owned statuses don't get a row (the creator isn't "assigned").
 */
export async function recordAssignment(
  tx: Tx,
  params: { applicationId: string; assigneeId: string | null; assignedById: string | null; status: ApplicationStatus },
): Promise<void> {
  if (!params.assigneeId) {
    return;
  }
  const target = ownerTargetForStatus(params.status);
  if (target === null || target === "creator") {
    return;
  }
  await tx.assignment.create({
    data: {
      applicationId: params.applicationId,
      assigneeId: params.assigneeId,
      assignedById: params.assignedById,
      status: params.status,
    },
  });
}
