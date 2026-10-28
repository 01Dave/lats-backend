import bcrypt from "bcrypt";
import { prisma } from "../db/client";
import { RoleName } from "../config/roles";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { NotFoundError, ConflictError, ForbiddenError } from "../utils/errors";

// Same cost factor as scripts/seed.ts — kept as one constant so the two
// don't silently drift apart.
const BCRYPT_ROUNDS = 10;

// Never return passwordHash over the API, under any circumstance.
function toSafeUser<T extends { passwordHash: string }>(user: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: RoleName;
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError(`A user with email '${input.email}' already exists`);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash,
    },
  });

  return toSafeUser(user);
}

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return users.map(toSafeUser);
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError("User not found");
  }
  return toSafeUser(user);
}

export interface UpdateUserInput {
  name?: string;
  role?: RoleName;
  active?: boolean;
}

/**
 * Admin can't deactivate or demote their own account — a single-admin
 * setup could otherwise lock itself out with no way back in short of a
 * direct database edit. A second admin account can still do either to
 * this one.
 */
export async function updateUser(actor: AuthenticatedUser, id: string, input: UpdateUserInput) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (actor.id === id) {
    if (input.active === false) {
      throw new ForbiddenError("You cannot deactivate your own account");
    }
    if (input.role && input.role !== "admin") {
      throw new ForbiddenError("You cannot change your own role away from admin");
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: input.name,
      role: input.role,
      active: input.active,
    },
  });

  return toSafeUser(updated);
}

export async function resetPassword(id: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const updated = await prisma.user.update({ where: { id }, data: { passwordHash } });
  return toSafeUser(updated);
}
