import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { requirePermission } from "../middleware/rbac-middleware";
import { validateQuery } from "../middleware/validate-middleware";
import { applicationsCsvQuerySchema, summaryQuerySchema } from "../validators/report-validator";
import {
  applicationsCsvController,
  summaryController,
  pipelineController,
} from "../api/report-controller";

const router = Router();

router.use(authMiddleware);
router.use(requirePermission("report:view"));

router.get("/applications.csv", validateQuery(applicationsCsvQuerySchema), applicationsCsvController);
router.get("/summary", validateQuery(summaryQuerySchema), summaryController);
router.get("/pipeline", pipelineController);

export default router;
