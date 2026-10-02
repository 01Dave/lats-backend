import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { requirePermission } from "../middleware/rbac-middleware";
import { validateBody } from "../middleware/validate-middleware";
import { uploadSingleDocument } from "../middleware/upload-middleware";
import { createApplicationSchema, withdrawSchema, updateApplicationSchema } from "../validators/application-validator";
import { setDocumentStatusSchema } from "../validators/document-validator";
import {
  hodDecisionSchema,
  creditDecisionSchema,
  internalControlDecisionSchema,
  mdDecisionSchema,
  resolveQuerySchema,
} from "../validators/approval-validator";
import { addCommentSchema } from "../validators/comment-validator";
import {
  createApplicationController,
  updateApplicationController,
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
import {
  hodDecisionController,
  creditDecisionController,
  internalControlDecisionController,
  mdDecisionController,
  resolveQueryController,
  listApprovalsController,
} from "../api/approval-controller";
import { addCommentController, listCommentsController } from "../api/comment-controller";

const router = Router();

router.use(authMiddleware);

router.post("/", requirePermission("application:create"), validateBody(createApplicationSchema), createApplicationController);
router.get("/", listApplicationsController);
router.get("/:id", getApplicationController);
// No requirePermission wrapper — same pattern as submit: creator-only and
// DRAFT-only are enforced inside the service, not at the route layer.
router.patch("/:id", validateBody(updateApplicationSchema), updateApplicationController);
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

// ---------- Approval decisions ----------
// Each endpoint is gated on the permission that identifies the stage
// role; the specific decision's legality (right status, right actor,
// comment present when required) is still enforced by the state machine
// itself inside approval-service.ts — these permission checks are a
// coarser first gate, not a duplicate of that logic.
router.post(
  "/:id/hod-decision",
  requirePermission("hod:approve"),
  validateBody(hodDecisionSchema),
  hodDecisionController,
);
router.post(
  "/:id/credit-decision",
  requirePermission("credit:review"),
  validateBody(creditDecisionSchema),
  creditDecisionController,
);
router.post(
  "/:id/internal-control-decision",
  requirePermission("control:verify"),
  validateBody(internalControlDecisionSchema),
  internalControlDecisionController,
);
router.post(
  "/:id/md-decision",
  requirePermission("approval:md"),
  validateBody(mdDecisionSchema),
  mdDecisionController,
);
// No requirePermission wrapper — one endpoint resolves any of the three
// query states, and who's allowed to call it depends on WHICH query
// state the application is in (Sales for HOD_QUERY, HOD for
// CREDIT_QUERY, Credit Review for IC_QUERY). The state machine's own
// actor check is the real gate here.
router.post("/:id/resolve-query", validateBody(resolveQuerySchema), resolveQueryController);
router.get("/:id/approvals", listApprovalsController);

// ---------- Comments ----------
router.get("/:id/comments", listCommentsController);
router.post("/:id/comments", requirePermission("comment:create"), validateBody(addCommentSchema), addCommentController);

export default router;
