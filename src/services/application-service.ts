import { prisma } from "../db/client";
import { generateAppNumber } from "../utils/app-number-generator";
import { applyAction } from "../workflow/state-machine";
import { NotFoundError } from "../utils/errors";
import { AuthenticatedUser } from "../middleware/auth-middleware";

export interface CreateApplicationInput {
  branch: string;
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
      branch: input.branch,
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
    },
  });
}

/**
 * Narrower than Prisma's generated ApplicationWhereInput on purpose — this
 * file only ever builds one of these three shapes. Written by hand rather
 * than imported from the generated client because that client falls back
 * to a permissive `any` stub whenever `prisma generate` can't reach its
 * engine binary (e.g. in this sandbox); on a machine with real network
 * access, swap this for `Prisma.ApplicationWhereInput` if you'd rather
 * defer to the generated type.
 */
interface ApplicationVisibilityWhere {
  id?: string;
  branch?: string;
  createdById?: string;
}

/**
 * Builds the Prisma `where` clause enforcing application:view:own /
 * :branch / :all — the single place visibility scope is decided, so
 * every read path (getApplicationById, listApplications) stays consistent.
 */
function visibilityWhere(actor: AuthenticatedUser): ApplicationVisibilityWhere {
  if (actor.permissions.includes("application:view:all")) {
    return {};
  }
  if (actor.permissions.includes("application:view:branch")) {
    return { branch: actor.branch ?? "__no_branch__" };
  }
  if (actor.permissions.includes("application:view:own")) {
    return { createdById: actor.id };
  }
  // No view permission at all — matches nothing.
  return { id: "__none__" };
}

export async function getApplicationById(actor: AuthenticatedUser, id: string) {
  const application = await prisma.application.findFirst({
    where: { id, ...visibilityWhere(actor) },
  });

  // NotFoundError rather than ForbiddenError for out-of-scope records —
  // avoids confirming a given application ID exists to someone who can't see it.
  if (!application) {
    throw new NotFoundError("Application not found");
  }

  return application;
}

export async function listApplications(actor: AuthenticatedUser) {
  return prisma.application.findMany({
    where: visibilityWhere(actor),
    orderBy: { createdAt: "desc" },
  });
}

/**
 * DRAFT -> SUBMITTED -> (system-chained) HOD_IN_REVIEW. Only the Sales
 * user who created the application may submit it.
 */
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

  return prisma.application.update({
    where: { id },
    data: { status: result.status },
  });
}

/**
 * Records the withdrawal comment as an Approval row (stage: null — not
 * owned by any approval stage) so it's actually persisted, rather than
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
      data: { status: result.status },
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
