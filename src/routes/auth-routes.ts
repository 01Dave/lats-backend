import { Router } from "express";
import { loginController, meController } from "../api/auth-controller";
import { validateBody } from "../middleware/validate-middleware";
import { loginSchema } from "../validators/auth-validator";
import { authMiddleware } from "../middleware/auth-middleware";
import { loginThrottleMiddleware } from "../middleware/login-throttle-middleware";

const router = Router();

// Throttle goes after validateBody (malformed requests aren't guesses and
// shouldn't be counted) and before the controller (so a locked-out key
// never reaches the bcrypt comparison at all).
router.post("/login", validateBody(loginSchema), loginThrottleMiddleware, loginController);
router.get("/me", authMiddleware, meController);

export default router;
