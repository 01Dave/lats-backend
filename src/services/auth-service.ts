import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "../db/client";
import { env } from "../config/env";
import { permissionsForRole, RoleName } from "../config/roles";

export class InvalidCredentialsError extends Error {}
export class AccountInactiveError extends Error {}

export interface LoginResult {
  token: string;
  expiresIn: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: RoleName;
    permissions: string[];
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new InvalidCredentialsError();
  }

  if (!user.active) {
    throw new AccountInactiveError();
  }

  // @types/jsonwebtoken types expiresIn as number | StringValue (a branded
  // string type from the "ms" package), not plain string — env.jwtExpiresIn
  // is validated at boot to be a string like "12h", so this cast is safe.
  const signOptions: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  const token = jwt.sign({ sub: user.id }, env.jwtSecret, signOptions);

  return {
    token,
    expiresIn: env.jwtExpiresIn,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as RoleName,
      permissions: permissionsForRole(user.role as RoleName),
    },
  };
}
