import PDFDocument from "pdfkit";
import { formatLagosDate, formatLagosDateTime } from "./report-dates";
import { decisionLabel, stageLabel, statusLabel } from "./status-labels";

/**
 * Builds the one-case PDF. Pure apart from pdfkit (no Prisma/env), so it is
 * unit-tested by rendering a PDF and reading its text back.
 */

export interface CasePdfData {
  appNumber: string;
  status: string;
  branch: string;
  productName: string;
  customerName: string;
  customerPhone: string;
  requestedAmount: string | number;
  tenorMonths: number;
  purpose: string;
  createdAt: Date;
  createdByName: string;
  ownerName: string | null;
  kycConfirmed: boolean;
  kycConfirmedByName: string | null;
  kycConfirmedAt: Date | null;
  disbursement: {
    amount: string | number;
    date: Date | null;
    method: string | null;
    reference: string | null;
    byName: string | null;
    at: Date | null;
  } | null;
  approvals: Array<{
    at: Date;
    stage: string | null;
    decision: string;
    actorName: string;
    comment: string | null;
    resultingStatus: string;
  }>;
  comments: Array<{ at: Date; authorName: string; body: string }>;
  assignments: Array<{ at: Date; assigneeName: string; assignedByName: string | null }>;
  documents: Array<{ docType: string; filename: string; status: string; version: number; uploadedAt: Date }>;
  generatedAt: Date;
  generatedByName: string;
}

function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(value);
}

const MARGIN = 50;

export function buildCasePdf(data: CasePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `Loan application ${data.appNumber}`, Author: "LATS" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - MARGIN * 2;

    const heading = (text: string) => {
      if (doc.y > doc.page.height - 140) {
        doc.addPage();
      }
      doc.moveDown(0.8).font("Helvetica-Bold").fontSize(12).fillColor("#000").text(text);
      doc.moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + width, doc.y + 2).strokeColor("#999").stroke();
      doc.moveDown(0.5).font("Helvetica").fontSize(10);
    };
    const field = (label: string, value: string) => {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value || "-");
    };

    doc.font("Helvetica-Bold").fontSize(18).text("Loan Application Report");
    doc.fontSize(11).font("Helvetica").fillColor("#444")
      .text(`${data.appNumber}  |  ${statusLabel(data.status)}`);
    doc.fillColor("#000").fontSize(10);

    heading("Application");
    field("Customer", data.customerName);
    field("Phone", data.customerPhone);
    field("Loan type", data.productName);
    field("Requested amount", money(data.requestedAmount));
    field("Tenor", `${data.tenorMonths} months`);
    field("Purpose", data.purpose);
    field("Branch", data.branch);
    field("Started by", `${data.createdByName} on ${formatLagosDateTime(data.createdAt)}`);
    field("Current owner", data.ownerName ?? "None (case closed or not yet submitted)");
    field("Status", statusLabel(data.status));

    heading("KYC");
    field(
      "KYC confirmed",
      data.kycConfirmed
        ? `Yes, by ${data.kycConfirmedByName ?? "unknown"}${data.kycConfirmedAt ? ` on ${formatLagosDateTime(data.kycConfirmedAt)}` : ""}`
        : "Not yet",
    );

    if (data.disbursement) {
      const d = data.disbursement;
      heading("Disbursement");
      field("Amount", money(d.amount));
      field("Date", d.date ? formatLagosDate(d.date) : "");
      field("Method", d.method ?? "");
      field("Reference", d.reference ?? "");
      field("Recorded by", d.byName ? `${d.byName}${d.at ? ` on ${formatLagosDateTime(d.at)}` : ""}` : "");
    }

    heading("Approval trail");
    if (data.approvals.length === 0) {
      doc.text("No decisions recorded yet.");
    }
    for (const a of data.approvals) {
      doc.font("Helvetica-Bold")
        .text(`${formatLagosDateTime(a.at)}  -  ${stageLabel(a.stage)}: ${decisionLabel(a.decision)}`);
      doc.font("Helvetica").text(`By ${a.actorName}. Status after: ${statusLabel(a.resultingStatus)}`);
      if (a.comment) {
        doc.text(`Comment: ${a.comment}`, { indent: 12 });
      }
      doc.moveDown(0.4);
    }

    heading("Case notes");
    if (data.comments.length === 0) {
      doc.text("No notes.");
    }
    for (const c of data.comments) {
      doc.font("Helvetica-Bold").text(`${formatLagosDateTime(c.at)}  -  ${c.authorName}`);
      doc.font("Helvetica").text(c.body, { indent: 12 });
      doc.moveDown(0.4);
    }

    heading("Case owner history");
    if (data.assignments.length === 0) {
      doc.text("No assignments.");
    }
    for (const s of data.assignments) {
      doc.text(
        `${formatLagosDateTime(s.at)}  -  ${s.assigneeName} (${s.assignedByName ? `assigned by ${s.assignedByName}` : "assigned automatically"})`,
      );
    }

    heading("Documents (current versions)");
    if (data.documents.length === 0) {
      doc.text("No documents uploaded.");
    }
    for (const d of data.documents) {
      doc.text(`${d.docType}  -  ${d.filename}  (v${d.version}, ${d.status}, uploaded ${formatLagosDate(d.uploadedAt)})`);
    }

    // Footer on every page, added once the page count is known.
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      // Footer sits inside the bottom margin; without this pdfkit adds a blank page for it.
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#666").text(
        `${data.appNumber}  |  Generated ${formatLagosDateTime(data.generatedAt)} by ${data.generatedByName}  |  Page ${i + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - 35,
        { width, align: "center", lineBreak: false },
      );
    }

    doc.end();
  });
}
