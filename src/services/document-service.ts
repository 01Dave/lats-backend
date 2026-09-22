import { prisma } from "../db/client";
import { saveFile } from "../utils/file-storage";
import { NotFoundError } from "../utils/errors";

export interface UploadDocumentInput {
  applicationId: string;
  docType: string;
  originalFilename: string;
  buffer: Buffer;
  uploadedById: string;
}

/**
 * Versioned — on a re-upload of the same docType, the previous version is
 * kept (current: false) rather than deleted or overwritten, for an audit
 * trail. docType is a free descriptor (no checklist to match against in
 * this version of the system — verification happens physically; see
 * setDocumentStatus below for how a document gets vetted digitally).
 */
export async function uploadDocument(input: UploadDocumentInput) {
  const previousCurrent = await prisma.document.findFirst({
    where: { applicationId: input.applicationId, docType: input.docType, current: true },
  });

  const storagePath = await saveFile(input.applicationId, input.originalFilename, input.buffer);
  const nextVersion = previousCurrent ? previousCurrent.version + 1 : 1;

  if (previousCurrent) {
    await prisma.document.update({ where: { id: previousCurrent.id }, data: { current: false } });
  }

  return prisma.document.create({
    data: {
      applicationId: input.applicationId,
      docType: input.docType,
      filename: input.originalFilename,
      storagePath,
      version: nextVersion,
      current: true,
      uploadedById: input.uploadedById,
      status: "pending",
    },
  });
}

export async function listDocuments(applicationId: string) {
  return prisma.document.findMany({
    where: { applicationId },
    orderBy: [{ docType: "asc" }, { version: "desc" }],
  });
}

export async function getDocumentForDownload(applicationId: string, documentId: string) {
  const document = await prisma.document.findFirst({ where: { id: documentId, applicationId } });
  if (!document) {
    throw new NotFoundError("Document not found");
  }
  return document;
}

/**
 * "Vetted independently" per project decision: whoever reviews a document
 * just sets its status directly — not gated on any checklist, not tied
 * to any workflow stage transition.
 */
export async function setDocumentStatus(
  applicationId: string,
  documentId: string,
  status: "pending" | "verified" | "rejected" | "expired",
) {
  const document = await prisma.document.findFirst({ where: { id: documentId, applicationId } });
  if (!document) {
    throw new NotFoundError("Document not found");
  }

  return prisma.document.update({
    where: { id: documentId },
    data: { status },
  });
}
