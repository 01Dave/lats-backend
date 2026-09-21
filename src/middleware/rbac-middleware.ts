import { Request, Response, NextFunction } from "express";
import { Permission } from "../config/roles";

/**
 * Usage: router.post('/x', authMiddleware, requirePermission('kyc:verify'), controller)
 * Must run AFTER authMiddleware — reads req.user.permissions.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user?.permissions.includes(permission)) {
      res.status(403).json({ code: "FORBIDDEN", message: `Missing required permission: ${permission}` });
      return;
    }
    next();
  };
}
