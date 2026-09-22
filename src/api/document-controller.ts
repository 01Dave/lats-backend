import { Request, Response } from "express";
import { catchAsync } from "../middleware/catch-async";
import * as applicationService from "../services/application-service";
import * as documentService from "../services/document-service";
import { getFile } from "../utils/file-storage";
import { ValidationError } from "../utils/errors";

export const listDocumentsController = catchAsync(async (req: Request, res: Response) => {
  await applicationService.getApplicationById(req.user!, req.params.id);
  const documents = await documentService.listDocuments(req.params.id);
  res.status(200).json(documents);
});

export const uploadDocumentController = catchAsync(async (req: Request, res: Response) => {
  await applicationService.getApplicationById(req.user!, req.params.id);

  if (!req.file) {
    throw new ValidationError("A file is required");
  }
  if (!req.body.docType) {
    throw new ValidationError("docType is required");
  }

  const document = await documentService.uploadDocument({
    applicationId: req.params.id,
    docType: req.body.docType,
    originalFilename: req.file.originalname,
    buffer: req.file.buffer,
    uploadedById: req.user!.id,
  });

  res.status(201).json(document);
});

export const downloadDocumentController = catchAsync(async (req: Request, res: Response) => {
  await applicationService.getApplicationById(req.user!, req.params.id);
  const document = await documentService.getDocumentForDownload(req.params.id, req.params.documentId);
  const buffer = await getFile(document.storagePath);
  res.setHeader("Content-Disposition", `attachment; filename="${document.filename}"`);
  res.send(buffer);
});

export const setDocumentStatusController = catchAsync(async (req: Request, res: Response) => {
  await applicationService.getApplicationById(req.user!, req.params.id);
  const document = await documentService.setDocumentStatus(req.params.id, req.params.documentId, req.body.status);
  res.status(200).json(document);
});
