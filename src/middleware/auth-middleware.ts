import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { permissionsForRole, RoleName, Permission } from "../config/roles";
import { prisma } from "../db/client";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
  branch: string | null;
  permissions: Permission[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface JwtPayload {
  sub: string;
}

/**
 * Verifies the bearer JWT and attaches req.user.
 *
 * Re-fetches the user on every request (rather than trusting a cached
 * role/permission claim in the token) so that `active: false` takes
 * effect immediately on the user's next request — this is the
 * lightweight revocation stopgap agreed on on for Phase 1, standing in
 * for full refresh-token revocation until Phase 2.
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ code: "UNAUTHENTICATED", message: "Missing bearer token" });
    return;
  }

  const token = header.slice("Bearer ".length);

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
  } catch {
    res.status(401).json({ code: "INVALID_TOKEN", message: "Token is invalid or expired" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user || !user.active) {
    res.status(401).json({ code: "ACCOUNT_INACTIVE", message: "Account is inactive or does not exist" });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role as RoleName,
    branch: user.branch,
    permissions: permissionsForRole(user.role as RoleName),
  };

  next();
}
