import { prisma } from "../db/client";
import { applyAction, WorkflowAction } from "../workflow/state-machine";
import { ApplicationStatus } from "../workflow/statuses";
import { ValidationError, NotFoundError } from "../utils/errors";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { getApplicationById } from "./application-service";

type ApprovalStage = "HOD" | "CREDIT_REVIEW" | "INTERNAL_CONTROL" | "MD" | "FINANCE" | "WITHDRAWAL";
type ApprovalDecision = "APPROVE" | "QUERY" | "DECLINE" | "REJECT" | "RESOLVE" | "WITHDRAW" | "DISBURSE";

/**
 * Runs a workflow action end to end: validates via applyAction (state
 * machine is still the sole authority on legality), then in one
 * transaction updates Application.status and records the decision as an
 * Approval row. This is the one place every decision endpoint below
 * funnels through, so "update status" and "log the decision" can never
 * drift out of sync with each other.
 */
async function executeDecision(params: {
  applicationId: string;
  action: WorkflowAction;
  actorId: string;
  actorRole: AuthenticatedUser["role"];
  comment?: string;
  stage: ApprovalStage | null;
  decision: ApprovalDecision;
  extraApplicationData?: Record<string, unknown>;
}) {
  const application = await prisma.application.findUnique({ where: { id: params.applicationId } });
  if (!application) {
    throw new NotFoundError("Application not found");
  }

  const result = applyAction({
    currentStatus: application.status,
    action: params.action,
    actorRole: params.actorRole,
    comment: params.comment,
  });

  return prisma.$transaction(async (
    // See the matching comment in application-service.ts withdrawApplication
    // for why this is an explicit `any`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
  ) => {
    const updated = await tx.application.update({
      where: { id: params.applicationId },
      data: { status: result.status, ...params.extraApplicationData },
    });

    await tx.approval.create({
      data: {
        applicationId: params.applicationId,
        stage: params.stage,
        decision: params.decision,
        actorId: params.actorId,
        comment: params.comment ?? null,
        resultingStatus: result.status,
      },
    });

    return updated;
  });
}

export interface HodDecisionInput {
  decision: "approve" | "query" | "reject";
  comment?: string;
  kycConfirmed?: boolean;
}

/**
 * KYC confirmation is folded into the approval call itself (project
 * decision — verification is physical, so there's no separate digital
 * checklist to gate on). Approving without kycConfirmed: true is
 * rejected before the state machine is even consulted.
 *
 * `reject` ends the case outright (HOD_REJECTED, closed) — added
 * because a query alone can't handle a disqualifying problem (e.g. a
 * fraudulent ID) that isn't something Sales can fix by resubmitting.
 */
export async function hodDecision(actor: AuthenticatedUser, applicationId: string, input: HodDecisionInput) {
  if (input.decision === "approve") {
    if (input.kycConfirmed !== true) {
      throw new ValidationError("kycConfirmed must be true to approve — HOD must confirm physical KYC was checked");
    }
    return executeDecision({
      applicationId,
      action: "hod_approve",
      actorId: actor.id,
      actorRole: actor.role,
      comment: input.comment,
      stage: "HOD",
      decision: "APPROVE",
      extraApplicationData: { kycConfirmed: true, kycConfirmedById: actor.id, kycConfirmedAt: new Date() },
    });
  }

  if (input.decision === "reject") {
    return executeDecision({
      applicationId,
      action: "hod_reject",
      actorId: actor.id,
      actorRole: actor.role,
      comment: input.comment,
      stage: "HOD",
      decision: "REJECT",
    });
  }

  return executeDecision({
    applicationId,
    action: "hod_query",
    actorId: actor.id,
    actorRole: actor.role,
    comment: input.comment,
    stage: "HOD",
    decision: "QUERY",
  });
}

export interface CreditDecisionInput {
  decision: "approve" | "query" | "decline";
  comment?: string;
}

export async function creditDecision(actor: AuthenticatedUser, applicationId: string, input: CreditDecisionInput) {
  const actionByDecision: Record<CreditDecisionInput["decision"], WorkflowAction> = {
    approve: "credit_approve",
    query: "credit_query",
    decline: "credit_decline",
  };
  const decisionByInput: Record<CreditDecisionInput["decision"], ApprovalDecision> = {
    approve: "APPROVE",
    query: "QUERY",
    decline: "DECLINE",
  };

  return executeDecision({
    applicationId,
    action: actionByDecision[input.decision],
    actorId: actor.id,
    actorRole: actor.role,
    comment: input.comment,
    stage: "CREDIT_REVIEW",
    decision: decisionByInput[input.decision],
  });
}

export interface InternalControlDecisionInput {
  decision: "approve" | "query" | "reject";
  comment?: string;
}

export async function internalControlDecision(
  actor: AuthenticatedUser,
  applicationId: string,
  input: InternalControlDecisionInput,
) {
  const actionByDecision: Record<InternalControlDecisionInput["decision"], WorkflowAction> = {
    approve: "ic_approve",
    query: "ic_query",
    reject: "ic_reject",
  };
  const decisionByInput: Record<InternalControlDecisionInput["decision"], ApprovalDecision> = {
    approve: "APPROVE",
    query: "QUERY",
    reject: "REJECT",
  };

  return executeDecision({
    applicationId,
    action: actionByDecision[input.decision],
    actorId: actor.id,
    actorRole: actor.role,
    comment: input.comment,
    stage: "INTERNAL_CONTROL",
    decision: decisionByInput[input.decision],
  });
}

export interface MdDecisionInput {
  decision: "approve" | "reject";
  comment?: string;
}

export async function mdDecision(actor: AuthenticatedUser, applicationId: string, input: MdDecisionInput) {
  const actionByDecision: Record<MdDecisionInput["decision"], WorkflowAction> = {
    approve: "md_approve",
    reject: "md_reject",
  };
  const decisionByInput: Record<MdDecisionInput["decision"], ApprovalDecision> = {
    approve: "APPROVE",
    reject: "REJECT",
  };

  return executeDecision({
    applicationId,
    action: actionByDecision[input.decision],
    actorId: actor.id,
    actorRole: actor.role,
    comment: input.comment,
    stage: "MD",
    decision: decisionByInput[input.decision],
  });
}

const RESOLVE_ACTION_BY_STATUS: Partial<Record<ApplicationStatus, WorkflowAction>> = {
  HOD_QUERY: "hod_resolve",
  CREDIT_QUERY: "credit_resolve",
  IC_QUERY: "ic_resolve",
};

/**
 * One generic endpoint for resolving any of the three query states —
 * which specific action applies is inferred from the application's
 * current status; the state machine's own actor check (see
 * state-machine.ts TRANSITIONS) is what actually enforces who's allowed
 * to call it (Sales for HOD_QUERY, HOD for CREDIT_QUERY, Credit Review
 * for IC_QUERY), same as every other action.
 */
export async function resolveQuery(actor: AuthenticatedUser, applicationId: string, comment: string) {
  // getApplicationById enforces visibility scope before we even look at status.
  const application = await getApplicationById(actor, applicationId);

  // application.status comes back typed as `any` from the sandbox's stub
  // Prisma client (see the $transaction comments above) — cast to the
  // real ApplicationStatus type so the lookup below is properly checked.
  const currentStatus = application.status as ApplicationStatus;
  const action = RESOLVE_ACTION_BY_STATUS[currentStatus];
  if (!action) {
    throw new ValidationError(`Application is not in a query state (currently ${currentStatus})`);
  }

  return executeDecision({
    applicationId,
    action,
    actorId: actor.id,
    actorRole: actor.role,
    comment,
    stage: null,
    decision: "RESOLVE",
  });
}

export interface DisburseInput {
  disbursedAmount: number;
  disbursementDate: string;
  disbursementMethod: string;
  disbursementReference?: string;
  comment?: string;
}

/**
 * Finance's one-time disbursement record (PENDING_DISBURSEMENT -> DISBURSED,
 * a terminal status — not system-chained any further). Same pattern as
 * HOD's kycConfirmed fields: the data rides along on the Application row
 * via extraApplicationData rather than a separate table, since there's
 * only ever one disbursement per application in this version of the
 * system. disbursedById/disbursedAt are taken from the authenticated
 * actor and the server clock, not from the request body.
 */
export async function disburseApplication(actor: AuthenticatedUser, applicationId: string, input: DisburseInput) {
  return executeDecision({
    applicationId,
    action: "finance_disburse",
    actorId: actor.id,
    actorRole: actor.role,
    comment: input.comment,
    stage: "FINANCE",
    decision: "DISBURSE",
    extraApplicationData: {
      disbursedAmount: input.disbursedAmount,
      disbursementDate: new Date(input.disbursementDate),
      disbursementMethod: input.disbursementMethod,
      disbursementReference: input.disbursementReference ?? null,
      disbursedById: actor.id,
      disbursedAt: new Date(),
    },
  });
}

export async function listApprovals(actor: AuthenticatedUser, applicationId: string) {
  // Visibility-scoped — same rule as every other read of an application.
  await getApplicationById(actor, applicationId);
  return prisma.approval.findMany({
    where: { applicationId },
    orderBy: { createdAt: "asc" },
  });
}
