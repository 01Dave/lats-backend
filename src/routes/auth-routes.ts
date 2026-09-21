import { Router } from "express";
import { loginController, meController } from "../api/auth-controller";
import { validateBody } from "../middleware/validate-middleware";
import { loginSchema } from "../validators/auth-validator";
import { authMiddleware } from "../middleware/auth-middleware";

const router = Router();

router.post("/login", validateBody(loginSchema), loginController);
router.get("/me", authMiddleware, meController);

export default router;
