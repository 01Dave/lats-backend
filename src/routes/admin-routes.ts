import { Router } from "express";
import { authMiddleware } from "../middleware/auth-middleware";
import { requirePermission } from "../middleware/rbac-middleware";
import { validateBody } from "../middleware/validate-middleware";
import { createUserSchema, updateUserSchema, resetPasswordSchema } from "../validators/admin-validator";
import {
  createUserController,
  listUsersController,
  getUserController,
  updateUserController,
  resetPasswordController,
} from "../api/admin-controller";

const router = Router();

router.use(authMiddleware);
// Every route here requires admin:users — there's no partial admin access
// in this version of the system.
router.use(requirePermission("admin:users"));

router.post("/users", validateBody(createUserSchema), createUserController);
router.get("/users", listUsersController);
router.get("/users/:id", getUserController);
router.patch("/users/:id", validateBody(updateUserSchema), updateUserController);
router.post("/users/:id/reset-password", validateBody(resetPasswordSchema), resetPasswordController);

export default router;
