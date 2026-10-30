import { prisma } from "../db/client";
import { generateAppNumber } from "../utils/app-number-generator";
import { applyAction } from "../workflow/state-machine";
import { NotFoundError, ConflictError } from "../utils/errors";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { ApplicationStatus } from "../workflow/statuses";
import { buildPaginationMeta } from "../utils/pagination";
import { chooseOwnerId, recordAssignment, Tx } from "./assignment-service";
import { allowedActions } from "../workflow/allowed-actions";

// Who the application is shown as owned by. Kept to the fields a UI needs.
const OWNER_INCLUDE = { owner: { select: { id: true, name: true, role: true } } };

export interface CreateApplicationInput {
  productName: string;
  customerName: string;
  customerPhone: string;
  requestedAmount: number;
  tenorMonths: number;
  purpose: string;
}

export async function createApplication(actor: AuthenticatedUser, input: CreateApplicationInput) {
  const appNumber = await generateAppNumber();

  return prisma.application.create({
    data: {
      appNumber,
      status: "DRAFT",
      // branch is no longer an input: the bank is single-branch, so the
      // column just takes its database default ("Main").
      productName: input.productName,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      // Prisma accepts a plain number for a Decimal column at runtime;
      // avoiding Prisma.Decimal keeps this file free of a dependency on
      // the generated client's namespace exports (the sandbox's stub
      // client doesn't expose it when it can't reach its engine binary).
      requestedAmount: input.requestedAmount,
      tenorMonths: input.tenorMonths,
      purpose: input.purpose,
      createdById: actor.id,
      // A draft belongs to the Sales user who created it; ownership moves
      // on automatically with every transition (see assignment-service.ts).
      ownerId: actor.id,
    },
  });
}

/**
 * Narrower than Prisma's generated ApplicationWhereInput on purpose — this
 * file only ever builds one of these two shapes. Written by hand rather
 * than imported from the generated client because that client falls back
 * to a permissive `any` stub whenever `prisma generate` can't reach its
 * engine binary (e.g. in this sandbox); on a machine with real network
 * access, swap this for `Prisma.ApplicationWhereInput` if you'd rather
 * defer to the generated type.
 */
interface ApplicationVisibilityWhere {
  id?: string;
  createdById?: string;
}

/**
 * Builds the Prisma `where` clause enforcing application:view:own /
 * :all — the single place visibility scope is decided, so
 * every read path (getApplicationById, listApplications) stays consistent.
 */
function visibilityWhere(actor: AuthenticatedUser): ApplicationVisibilityWhere {
  if (actor.permissions.includes("application:view:all")) {
    return {};
  }
  if (actor.permissions.includes("application:view:own")) {
    return { createdById: actor.id };
  }
  // No view permission at all — matches nothing.
  return { id: "__none__" };
}

/**
 * Adds `allowedActions` — what this viewer can do with the case right now —
 * so the frontend doesn't have to re-implement the workflow rules. A hint
 * only; every endpoint still enforces its own rules.
 */
function withAllowedActions<T extends { status: ApplicationStatus; createdById: string; ownerId: string | null }>(
  actor: AuthenticatedUser,
  application: T,
) {
  return {
    ...application,
    allowedActions: allowedActions({
      status: application.status,
      role: actor.role,
      permissions: actor.permissions,
      isCreator: application.createdById === actor.id,
      isOwner: application.ownerId === actor.id,
    }),
  };
}

export async function getApplicationById(actor: AuthenticatedUser, id: string) {
  const application = await prisma.application.findFirst({
    where: { id, ...visibilityWhere(actor) },
    include: OWNER_INCLUDE,
  });

  // NotFoundError rather than ForbiddenError for out-of-scope records —
  // avoids confirming a given application ID exists to someone who can't see it.
  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return withAllowedActions(actor, application);
}

export interface ListApplicationsFilters {
  status?: ApplicationStatus;
  /** "me" = only applications the caller currently owns. */
  owner?: "me";
  page: number;
  limit: number;
}

/**
 * status narrows the result on top of visibilityWhere() — spread order
 * matters here: filters come after the spread so they can only add
 * constraints, never override/widen the actor's own scope.
 *
 * Returns an envelope ({ data, pagination }) rather than a bare array —
 * this is a breaking response-shape change from the previous version of
 * this endpoint (used to return the array directly). Worth flagging to
 * whoever's consuming this on the frontend.
 */
export async function listApplications(actor: AuthenticatedUser, filters: ListApplicationsFilters) {
  const where = {
    ...visibilityWhere(actor),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.owner === "me" ? { ownerId: actor.id } : {}),
  };

  const skip = (filters.page - 1) * filters.limit;

  const [data, total] = await Promise.all([
    prisma.application.findMany({
      where,
      include: OWNER_INCLUDE,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.limit,
    }),
    prisma.application.count({ where }),
  ]);

  return {
    data: (data as Array<Parameters<typeof withAllowedActions>[1]>).map((a) => withAllowedActions(actor, a)),
    pagination: buildPaginationMeta(filters.page, filters.limit, total),
  };
}

/**
 * DRAFT -> SUBMITTED -> (system-chained) HOD_IN_REVIEW. Only the Sales
 * user who created the application may submit it.
 */
export interface UpdateApplicationInput {
  productName?: string;
  customerName?: string;
  customerPhone?: string;
  requestedAmount?: number;
  tenorMonths?: number;
  purpose?: string;
}

/**
 * Only the creator, only while still DRAFT — per project decision, editing
 * mid-query (after HOD or another stage has sent it back) is a separate,
 * not-yet-designed question and deliberately NOT handled here. A query
 * response is still only a comment via resolve-query.
 */
export async function updateApplication(actor: AuthenticatedUser, id: string, input: UpdateApplicationInput) {
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) {
    throw new NotFoundError("Application not found");
  }
  if (application.createdById !== actor.id) {
    throw new NotFoundError("Application not found");
  }
  if (application.status !== "DRAFT") {
    throw new ConflictError("Only DRAFT applications can be edited");
  }

  return prisma.application.update({
    where: { id },
    data: input,
  });
}

export async function submitApplication(actor: AuthenticatedUser, id: string) {
  const application = await prisma.application.findUnique({ where: { id } });
  if (!application) {
    throw new NotFoundError("Application not found");
  }
  if (application.createdById !== actor.id) {
    throw new NotFoundError("Application not found");
  }

  const result = applyAction({
    currentStatus: application.status,
    action: "submit",
    actorRole: actor.role,
  });

  return prisma.$transaction(async (tx: Tx) => {
    // Submitting hands the case to an HOD.
    const ownerId = await chooseOwnerId(tx, application, result.status);
    const updated = await tx.application.update({
      where: { id },
      data: { status: result.status, ownerId },
    });
    await recordAssignment(tx, { applicationId: id, assigneeId: ownerId, assignedById: null, status: result.status });
    return updated;
  });
}

/**
 * Records the withdrawal comment as an Approval row (stage: "WITHDRAWAL",
 * decision: "WITHDRAW") so it's actually persisted, rather than
 * validated by the state machine and then discarded.
 */
export async function withdrawApplication(actor: AuthenticatedUser, id: string, comment: string) {
  const application = await getApplicationById(actor, id);

  const result = applyAction({
    currentStatus: application.status,
    action: "withdraw",
    actorRole: actor.role,
    comment,
  });

  return prisma.$transaction(async (
    // Explicit `any`, not implicit: the sandbox's stub Prisma client (see
    // notes elsewhere in this project on prisma generate needing network
    // access to its engine binary) types the whole client as `any`, which
    // makes $transaction's callback parameter uninferrable and trips
    // noImplicitAny. On a machine with a fully generated client this
    // would infer as Prisma.TransactionClient automatically; this
    // annotation is only here to satisfy the stub.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ) => {
    const updated = await tx.application.update({
      where: { id },
      // A withdrawn case is closed, so it has no owner.
      data: { status: result.status, ownerId: null },
    });

    await tx.approval.create({
      data: {
        applicationId: id,
        stage: "WITHDRAWAL",
        decision: "WITHDRAW",
        actorId: actor.id,
        comment,
        resultingStatus: result.status,
      },
    });

    return updated;
  });
}
