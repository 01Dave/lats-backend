import { Router } from "express";
import authRoutes from "./auth-routes";
import applicationRoutes from "./application-routes";
import adminRoutes from "./admin-routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/applications", applicationRoutes);
router.use("/admin", adminRoutes);

// Added in later steps: comments, approvals (with a simple kycConfirmed
// flag folded into the HOD decision), disbursement, admin user management
// — see architecture brief "Current task" build order. Still open:
// audit log, reports.

export default router;
