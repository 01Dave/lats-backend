import { prisma } from "../db/client";
import { NotFoundError } from "../utils/errors";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { buildCasePdf } from "../utils/case-pdf";
import { forceText, toCsv } from "../utils/csv";
import { dayEndExclusive, dayStart, formatLagosDateTime } from "../utils/report-dates";
import { buildMonthlySummary } from "../utils/report-summary";
import { buildPipeline, PIPELINE_STATUSES, stageEnteredAt } from "../utils/report-pipeline";
import { statusLabel } from "../utils/status-labels";

/**
 * Reports are read-only and limited to roles holding `report:view`
 * (enforced on the routes). Every one of those roles can already see all
 * applications, so no per-user scoping is applied here.
 */

/** A report is a download, not a page: cap it so one request can't pull the whole table. */
export const MAX_CSV_ROWS = 10_000;

type Money = { toString(): string };
interface Named { name: string }

interface CsvRow {
  appNumber: string; status: string; productName: string; customerName: string; customerPhone: string;
  requestedAmount: Money; tenorMonths: number; purpose: string; createdAt: Date; updatedAt: Date;
  disbursedAmount: Money | null; disbursementDate: Date | null;
  createdBy: Named; owner: Named | null;
}
interface SummaryDbRow {
  status: string; productName: string; requestedAmount: Money; disbursedAmount: Money | null; createdAt: Date;
}
interface PipelineDbRow {
  id: string; appNumber: string; status: string; customerName: string; productName: string;
  requestedAmount: Money; createdAt: Date; owner: Named | null;
  approvals: Array<{ createdAt: Date }>; assignments: Array<{ createdAt: Date }>;
}
interface CaseDbRow {
  appNumber: string; status: string; branch: string; productName: string; customerName: string;
  customerPhone: string; requestedAmount: Money; tenorMonths: number; purpose: string; createdAt: Date;
  createdBy: Named; owner: Named | null; kycConfirmed: boolean; kycConfirmedById: string | null;
  kycConfirmedAt: Date | null; disbursedAmount: Money | null; disbursementDate: Date | null;
  disbursementMethod: string | null; disbursementReference: string | null; disbursedById: string | null;
  disbursedAt: Date | null;
  approvals: Array<{ createdAt: Date; stage: string | null; decision: string; comment: string | null; resultingStatus: string; actor: Named }>;
  comments: Array<{ createdAt: Date; body: string; author: Named }>;
  assignments: Array<{ createdAt: Date; assignee: Named; assignedBy: Named | null }>;
  documents: Array<{ docType: string; filename: string; status: string; version: number; uploadedAt: Date }>;
}

interface DateWindow {
  from?: string;
  to?: string;
}

function createdAtWindow({ from, to }: DateWindow) {
  if (!from && !to) {
    return {};
  }
  return {
    createdAt: {
      ...(from ? { gte: dayStart(from) } : {}),
      ...(to ? { lt: dayEndExclusive(to) } : {}),
    },
  };
}

export interface ApplicationsCsvFilters extends DateWindow {
  status?: string;
  productName?: string;
}

export async function applicationsCsv(filters: ApplicationsCsvFilters): Promise<{ csv: string; truncated: boolean }> {
  const rows = (await prisma.application.findMany({
    where: {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.productName ? { productName: filters.productName } : {}),
      ...createdAtWindow(filters),
    },
    include: {
      createdBy: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_CSV_ROWS + 1,
  })) as unknown as CsvRow[];

  const truncated = rows.length > MAX_CSV_ROWS;
  const shown = truncated ? rows.slice(0, MAX_CSV_ROWS) : rows;

  const headers = [
    "Application number", "Status", "Loan type", "Customer", "Phone",
    "Requested amount", "Tenor (months)", "Purpose", "Started by", "Case owner",
    "Created", "Last updated", "Disbursed amount", "Disbursement date",
  ];
  const body = shown.map((a) => [
    a.appNumber,
    statusLabel(a.status),
    a.productName,
    a.customerName,
    forceText(a.customerPhone),
    Number(a.requestedAmount).toFixed(2),
    a.tenorMonths,
    a.purpose,
    a.createdBy.name,
    a.owner?.name ?? "",
    formatLagosDateTime(a.createdAt),
    formatLagosDateTime(a.updatedAt),
    a.disbursedAmount === null ? "" : Number(a.disbursedAmount).toFixed(2),
    a.disbursementDate ? formatLagosDateTime(a.disbursementDate) : "",
  ]);
  return { csv: toCsv(headers, body), truncated };
}

export async function monthlySummary(window: DateWindow) {
  const rows = (await prisma.application.findMany({
    where: createdAtWindow(window),
    select: {
      status: true,
      productName: true,
      requestedAmount: true,
      disbursedAmount: true,
      createdAt: true,
    },
  })) as unknown as SummaryDbRow[];
  return {
    window: { from: window.from ?? null, to: window.to ?? null },
    timeZone: "Africa/Lagos",
    months: buildMonthlySummary(
      rows.map((r) => ({
        status: r.status,
        productName: r.productName,
        requestedAmount: r.requestedAmount.toString(),
        disbursedAmount: r.disbursedAmount === null ? null : r.disbursedAmount.toString(),
        createdAt: r.createdAt,
      })),
    ),
  };
}

export async function pipeline(now: Date = new Date()) {
  const rows = (await prisma.application.findMany({
    where: { status: { in: [...PIPELINE_STATUSES] as never[] } },
    include: {
      owner: { select: { name: true } },
      approvals: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
      assignments: {
        where: { assignedById: null },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  })) as unknown as PipelineDbRow[];

  return {
    generatedAt: now.toISOString(),
    totalOpen: rows.length,
    stages: buildPipeline(
      rows.map((r) => ({
        id: r.id,
        appNumber: r.appNumber,
        status: r.status,
        customerName: r.customerName,
        productName: r.productName,
        requestedAmount: r.requestedAmount.toString(),
        ownerName: r.owner?.name ?? null,
        stageEnteredAt: stageEnteredAt(
          r.createdAt,
          r.approvals[0]?.createdAt ?? null,
          r.assignments[0]?.createdAt ?? null,
        ),
      })),
      now,
    ),
  };
}

export async function casePdf(actor: AuthenticatedUser, id: string): Promise<{ filename: string; pdf: Buffer }> {
  const app = (await prisma.application.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      owner: { select: { name: true } },
      approvals: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      assignments: {
        include: { assignee: { select: { name: true } }, assignedBy: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
      documents: { where: { current: true }, orderBy: { uploadedAt: "asc" } },
    },
  })) as unknown as CaseDbRow | null;
  if (!app) {
    throw new NotFoundError("Application not found");
  }

  // KYC and disbursement record only a user id (no relation), so look the names up once.
  const ids = [app.kycConfirmedById, app.disbursedById].filter((x): x is string => !!x);
  const users = (ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : []) as Array<{ id: string; name: string }>;
  const nameOf = (userId: string | null) => users.find((u) => u.id === userId)?.name ?? null;

  const pdf = await buildCasePdf({
    appNumber: app.appNumber,
    status: app.status,
    branch: app.branch,
    productName: app.productName,
    customerName: app.customerName,
    customerPhone: app.customerPhone,
    requestedAmount: app.requestedAmount.toString(),
    tenorMonths: app.tenorMonths,
    purpose: app.purpose,
    createdAt: app.createdAt,
    createdByName: app.createdBy.name,
    ownerName: app.owner?.name ?? null,
    kycConfirmed: app.kycConfirmed,
    kycConfirmedByName: nameOf(app.kycConfirmedById),
    kycConfirmedAt: app.kycConfirmedAt,
    disbursement:
      app.disbursedAmount === null
        ? null
        : {
            amount: app.disbursedAmount.toString(),
            date: app.disbursementDate,
            method: app.disbursementMethod,
            reference: app.disbursementReference,
            byName: nameOf(app.disbursedById),
            at: app.disbursedAt,
          },
    approvals: app.approvals.map((a) => ({
      at: a.createdAt,
      stage: a.stage,
      decision: a.decision,
      actorName: a.actor.name,
      comment: a.comment,
      resultingStatus: a.resultingStatus,
    })),
    comments: app.comments.map((c) => ({ at: c.createdAt, authorName: c.author.name, body: c.body })),
    assignments: app.assignments.map((s) => ({
      at: s.createdAt,
      assigneeName: s.assignee.name,
      assignedByName: s.assignedBy?.name ?? null,
    })),
    documents: app.documents.map((d) => ({
      docType: d.docType,
      filename: d.filename,
      status: d.status,
      version: d.version,
      uploadedAt: d.uploadedAt,
    })),
    generatedAt: new Date(),
    generatedByName: actor.name,
  });

  return { filename: `${app.appNumber}.pdf`, pdf };
}
