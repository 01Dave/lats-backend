import { prisma } from "../db/client";
import { env } from "../config/env";
import { logger } from "../utils/logger";
import { createMailer } from "../utils/mailer";
import { buildRejectionEmail, isRejectionStatus } from "../utils/rejection-email";
import { ApplicationStatus } from "../workflow/statuses";

const mailer = createMailer(env.mail);

export interface RejectionNotice {
  applicationId: string;
  /** The closing status the case just reached (HOD_REJECTED, CREDIT_DECLINED, IC_REJECTED or MD_REJECTED). */
  status: ApplicationStatus;
  /** The reviewer who rejected it. */
  rejectedById: string;
  /** The reviewer's reason. */
  comment: string;
}

/**
 * Emails the Sales officer who started the loan when it is rejected at any
 * stage. Called AFTER the rejection is saved and never awaited by the
 * request: a mail failure (server down, bad address, slow connection) must
 * never undo or delay a rejection, so every problem is caught and logged
 * here and nothing is thrown.
 *
 * Does nothing at all (no database queries either) when email isn't
 * configured, or for statuses that aren't rejections.
 */
export async function notifyRejection(notice: RejectionNotice): Promise<void> {
  if (!mailer.enabled || !isRejectionStatus(notice.status)) {
    return;
  }

  try {
    const [application, rejectedBy] = await Promise.all([
      prisma.application.findUnique({
        where: { id: notice.applicationId },
        include: { createdBy: { select: { email: true, name: true } } },
      }),
      prisma.user.findUnique({ where: { id: notice.rejectedById }, select: { name: true } }),
    ]);

    if (!application || !application.createdBy) {
      logger.warn({ applicationId: notice.applicationId }, "Rejection email skipped: application or creator not found");
      return;
    }

    const message = buildRejectionEmail({
      status: notice.status,
      appNumber: application.appNumber,
      customerName: application.customerName,
      productName: application.productName,
      requestedAmount: String(application.requestedAmount),
      recipientName: application.createdBy.name,
      rejectedByName: rejectedBy?.name ?? "a reviewer",
      comment: notice.comment,
    });

    await mailer.send({ to: application.createdBy.email, ...message });
    logger.info({ applicationId: notice.applicationId, status: notice.status }, "Rejection email sent");
  } catch (err) {
    logger.error(
      { applicationId: notice.applicationId, status: notice.status, err: err instanceof Error ? err.message : err },
      "Rejection email failed (the rejection itself was saved)",
    );
  }
}
