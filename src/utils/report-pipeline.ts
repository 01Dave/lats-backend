/**
 * Pipeline and aging calculation. Pure, unit-tested.
 *
 * Shows where open loans are sitting and for how long. "Resting" statuses
 * are the ones where someone has to act next; the in-between approved states
 * (HOD_APPROVED etc.) are transient and never rest.
 */

export const PIPELINE_STATUSES = [
  "HOD_IN_REVIEW",
  "HOD_QUERY",
  "CREDIT_IN_REVIEW",
  "CREDIT_QUERY",
  "IC_IN_REVIEW",
  "IC_QUERY",
  "PENDING_MD",
  "PENDING_DISBURSEMENT",
] as const;

const MS_PER_DAY = 86_400_000;

export interface PipelineRow {
  id: string;
  appNumber: string;
  status: string;
  customerName: string;
  productName: string;
  requestedAmount: string | number;
  ownerName: string | null;
  /** When the case reached its current status. */
  stageEnteredAt: Date;
}

export interface PipelineStage {
  status: string;
  count: number;
  averageDays: number;
  oldest: Array<{
    id: string;
    appNumber: string;
    customerName: string;
    productName: string;
    requestedAmount: string;
    owner: string | null;
    daysInStage: number;
  }>;
}

/** Whole days elapsed, one decimal place, never negative. */
export function daysBetween(from: Date, to: Date): number {
  const days = Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY);
  return Math.round(days * 10) / 10;
}

/**
 * The moment a case reached its current status: the later of its latest
 * decision and its latest automatic assignment (assignments happen in the
 * same transaction as each status change), else when it was created. Manual
 * reassignments are ignored because they do not change the stage.
 */
export function stageEnteredAt(
  createdAt: Date,
  latestApprovalAt: Date | null,
  latestAutoAssignmentAt: Date | null,
): Date {
  const times = [createdAt, latestApprovalAt, latestAutoAssignmentAt]
    .filter((d): d is Date => d !== null)
    .map((d) => d.getTime());
  return new Date(Math.max(...times));
}

export function buildPipeline(rows: PipelineRow[], now: Date, oldestCount = 5): PipelineStage[] {
  return PIPELINE_STATUSES.map((status) => {
    const inStage = rows
      .filter((r) => r.status === status)
      .map((r) => ({ row: r, days: daysBetween(r.stageEnteredAt, now) }))
      .sort((a, b) => b.days - a.days);
    const total = inStage.reduce((sum, x) => sum + x.days, 0);
    return {
      status,
      count: inStage.length,
      averageDays: inStage.length ? Math.round((total / inStage.length) * 10) / 10 : 0,
      oldest: inStage.slice(0, oldestCount).map(({ row, days }) => ({
        id: row.id,
        appNumber: row.appNumber,
        customerName: row.customerName,
        productName: row.productName,
        requestedAmount: String(row.requestedAmount),
        owner: row.ownerName,
        daysInStage: days,
      })),
    };
  });
}
