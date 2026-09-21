import { PrismaClient } from "@prisma/client";

// Singleton pattern — avoids exhausting the Postgres connection pool
// under ts-node-dev's hot-reload in development.
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
