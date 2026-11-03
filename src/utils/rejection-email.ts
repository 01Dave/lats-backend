import { ApplicationStatus } from "../workflow/statuses";

/**
 * The rejection notice sent to the Sales officer who started a loan.
 * Pure (no Prisma/env/mail library) so it is unit-testable; sending lives in
 * utils/mailer.ts and the lookup/orchestration in
 * services/notification-service.ts.
 *
 * One notice for every way a case can be rejected: the four closing
 * outcomes HOD reject, Credit Review decline, Internal Control reject and
 * MD reject. Withdrawal is not a rejection and sends nothing.
 */

interface RejectionKind {
  /** Who rejected it, in words a Sales officer would use. */
  stage: string;
  /** Credit Review "declines"; everyone else "rejects". */
  verb: "rejected" | "declined";
}

const REJECTION_BY_STATUS: Partial<Record<ApplicationStatus, RejectionKind>> = {
  HOD_REJECTED: { stage: "Head of Department", verb: "rejected" },
  CREDIT_DECLINED: { stage: "Credit Review", verb: "declined" },
  IC_REJECTED: { stage: "Internal Control", verb: "rejected" },
  MD_REJECTED: { stage: "Managing Director", verb: "rejected" },
};

export function isRejectionStatus(status: ApplicationStatus): boolean {
  return REJECTION_BY_STATUS[status] !== undefined;
}

export interface RejectionEmailInput {
  status: ApplicationStatus;
  appNumber: string;
  customerName: string;
  productName: string;
  /** Decimal as stored (a string such as "80000" or "80000.50"), or a number. */
  requestedAmount: string | number;
  recipientName: string;
  /** The reviewer who rejected it. */
  rejectedByName: string;
  /** The reviewer's reason (always present: a comment is mandatory to reject). */
  comment: string;
}

export interface RejectionEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "80000" -> "80,000"; keeps decimals only when there are some. */
export function formatAmount(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return String(value);
  }
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Strips line breaks so a user-supplied value can't inject extra header lines. */
function oneLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function buildRejectionEmail(input: RejectionEmailInput): RejectionEmail {
  const kind = REJECTION_BY_STATUS[input.status];
  if (!kind) {
    throw new Error(`${input.status} is not a rejection status`);
  }

  const subject = `Loan application ${oneLine(input.appNumber)} ${kind.verb} at ${kind.stage}`;
  const amount = formatAmount(input.requestedAmount);

  const lines = [
    `Hello ${oneLine(input.recipientName)},`,
    "",
    `The loan application you started has been ${kind.verb} at the ${kind.stage} stage.`,
    "",
    `Application:      ${input.appNumber}`,
    `Customer:         ${input.customerName}`,
    `Loan type:        ${input.productName}`,
    `Requested amount: ${amount}`,
    `${kind.verb === "declined" ? "Declined" : "Rejected"} by:      ${input.rejectedByName} (${kind.stage})`,
    "",
    "Reason given:",
    input.comment,
    "",
    "This application is now closed. This is an automatic message from the Loan Application Tracking System.",
  ];
  const text = lines.join("\n");

  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`;
  const html = [
    `<p>Hello ${escapeHtml(oneLine(input.recipientName))},</p>`,
    `<p>The loan application you started has been <strong>${kind.verb}</strong> at the <strong>${escapeHtml(kind.stage)}</strong> stage.</p>`,
    `<table style="border-collapse:collapse">`,
    row("Application", input.appNumber),
    row("Customer", input.customerName),
    row("Loan type", input.productName),
    row("Requested amount", amount),
    row(kind.verb === "declined" ? "Declined by" : "Rejected by", `${input.rejectedByName} (${kind.stage})`),
    `</table>`,
    `<p><strong>Reason given:</strong></p>`,
    `<blockquote style="margin:0 0 12px 0;padding-left:12px;border-left:3px solid #ccc">${escapeHtml(input.comment).replace(/\n/g, "<br>")}</blockquote>`,
    `<p style="color:#555">This application is now closed. This is an automatic message from the Loan Application Tracking System.</p>`,
  ].join("\n");

  return { subject, text, html };
}
