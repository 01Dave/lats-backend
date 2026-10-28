import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { listLoanTypesController } from "../api/meta-controller";

const router = Router();

// Any signed-in user can read reference data; no extra permission needed.
router.use(authMiddleware);

router.get("/loan-types", listLoanTypesController);

export default router;
