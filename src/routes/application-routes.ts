import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { requirePermission } from "../middleware/rbac-middleware";
import { validateBody } from "../middleware/validate-middleware";
import { createApplicationSchema, withdrawSchema } from "../validators/application-validator";
import {
  createApplicationController,
  listApplicationsController,
  getApplicationController,
  submitApplicationController,
  withdrawApplicationController,
} from "../api/application-controller";

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

export default router;
