import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { requirePermission } from "../middleware/rbac-middleware";
import { validateBody } from "../middleware/validate-middleware";
import { uploadSingleDocument } from "../middleware/upload-middleware";
import { createApplicationSchema, withdrawSchema } from "../validators/application-validator";
import { setDocumentStatusSchema } from "../validators/document-validator";
import {
  createApplicationController,
  listApplicationsController,
  getApplicationController,
  submitApplicationController,
  withdrawApplicationController,
} from "../api/application-controller";
import {
  listDocumentsController,
  uploadDocumentController,
  downloadDocumentController,
  setDocumentStatusController,
} from "../api/document-controller";

const router = Router();

router.use(authMiddleware);

router.post("/", requirePermission("application:create"), validateBody(createApplicationSchema), createApplicationController);
router.get("/", listApplicationsController);
router.get("/:id", getApplicationController);
router.post("/:id/submit", submitApplicationController);
router.post(
  "/:id/withdraw",
  requirePermission("application:withdraw"),
  validateBody(withdrawSchema),
  withdrawApplicationController,
);

// ---------- Documents ----------
// Uploaded and stored digitally, but vetted independently of any
// checklist — KYC verification itself is a physical, off-system process.
router.get("/:id/documents", requirePermission("document:view"), listDocumentsController);
router.post(
  "/:id/documents",
  requirePermission("document:upload"),
  (req, res, next) => {
    uploadSingleDocument(req, res, (err) => {
      if (err) {
        res.status(422).json({ code: "VALIDATION_ERROR", message: err.message });
        return;
      }
      next();
    });
  },
  uploadDocumentController,
);
router.get("/:id/documents/:documentId", requirePermission("document:view"), downloadDocumentController);
router.patch(
  "/:id/documents/:documentId",
  requirePermission("document:verify"),
  validateBody(setDocumentStatusSchema),
  setDocumentStatusController,
);

export default router;
