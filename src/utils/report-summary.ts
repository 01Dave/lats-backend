import { monthKey } from "./report-dates";
import { fromCents, toCents } from "./money";

/**
 * Monthly summary calculation. Pure (rows in, numbers out), unit-tested.
 *
 * Cohort rule: a loan belongs to the Lagos month it was CREATED in, and is
 * shown with whatever has happened to it since. So "October" answers "of the
 * loans started in October, how many have been disbursed / rejected /
 * withdrawn / are still open". Drafts were never submitted and are counted
 * separately, not as part of the pipeline.
 */

export interface SummaryRow {
  status: string;
  productName: string;
  requestedAmount: string | number;
  disbursedAmount: string | number | null;
  createdAt: Date;
}

export interface SummaryBucket {
  submitted: number;
  inProgress: number;
  disbursed: number;
  rejected: number;
  rejectedByStage: { hod: number; creditReview: number; internalControl: number; md: number };
  withdrawn: number;
  requestedAmount: string;
  disbursedAmount: string;
}

export interface MonthlySummary {
  month: string;
  drafts: number;
  total: SummaryBucket;
  byLoanType: Array<{ productName: string } & SummaryBucket>;
}

interface Acc {
  submitted: number;
  inProgress: number;
  disbursed: number;
  rejected: number;
  hod: number;
  creditReview: number;
  internalControl: number;
  md: number;
  withdrawn: number;
  requestedCents: number;
  disbursedCents: number;
}

const newAcc = (): Acc => ({
  submitted: 0, inProgress: 0, disbursed: 0, rejected: 0,
  hod: 0, creditReview: 0, internalControl: 0, md: 0,
  withdrawn: 0, requestedCents: 0, disbursedCents: 0,
});

function add(acc: Acc, row: SummaryRow): void {
  acc.submitted += 1;
  acc.requestedCents += toCents(row.requestedAmount);
  switch (row.status) {
    case "DISBURSED":
      acc.disbursed += 1;
      acc.disbursedCents += toCents(row.disbursedAmount);
      break;
    case "WITHDRAWN":
      acc.withdrawn += 1;
      break;
    case "HOD_REJECTED":
      acc.rejected += 1;
      acc.hod += 1;
      break;
    case "CREDIT_DECLINED":
      acc.rejected += 1;
      acc.creditReview += 1;
      break;
    case "IC_REJECTED":
      acc.rejected += 1;
      acc.internalControl += 1;
      break;
    case "MD_REJECTED":
      acc.rejected += 1;
      acc.md += 1;
      break;
    default:
      acc.inProgress += 1;
  }
}

function finish(acc: Acc): SummaryBucket {
  return {
    submitted: acc.submitted,
    inProgress: acc.inProgress,
    disbursed: acc.disbursed,
    rejected: acc.rejected,
    rejectedByStage: {
      hod: acc.hod,
      creditReview: acc.creditReview,
      internalControl: acc.internalControl,
      md: acc.md,
    },
    withdrawn: acc.withdrawn,
    requestedAmount: fromCents(acc.requestedCents),
    disbursedAmount: fromCents(acc.disbursedCents),
  };
}

/** Months come back oldest first. */
export function buildMonthlySummary(rows: SummaryRow[]): MonthlySummary[] {
  const months = new Map<string, { drafts: number; total: Acc; types: Map<string, Acc> }>();

  for (const row of rows) {
    const key = monthKey(row.createdAt);
    let month = months.get(key);
    if (!month) {
      month = { drafts: 0, total: newAcc(), types: new Map() };
      months.set(key, month);
    }
    if (row.status === "DRAFT") {
      month.drafts += 1;
      continue;
    }
    add(month.total, row);
    let type = month.types.get(row.productName);
    if (!type) {
      type = newAcc();
      month.types.set(row.productName, type);
    }
    add(type, row);
  }

  return [...months.keys()]
    .sort()
    .map((key) => {
      const month = months.get(key)!;
      return {
        month: key,
        drafts: month.drafts,
        total: finish(month.total),
        byLoanType: [...month.types.keys()]
          .sort()
          .map((productName) => ({ productName, ...finish(month.types.get(productName)!) })),
      };
    });
}
