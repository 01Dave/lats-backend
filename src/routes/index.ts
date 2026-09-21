import { Router } from "express";
import authRoutes from "./auth-routes";
import applicationRoutes from "./application-routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/applications", applicationRoutes);

// Added in later steps: kyc, documents, comments, approvals,
// disbursement, reports, admin — see architecture brief "Current task"
// build order.

export default router;
