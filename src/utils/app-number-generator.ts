import { prisma } from "../db/client";

/**
 * Generates the next LN-{YYYY}-{SEQUENCE} number (spec Section 8.2),
 * zero-padded to 6 digits. Uses an atomic increment on a per-year counter
 * row so concurrent submissions never collide; upsert covers the first
 * call of a new year.
 */
export async function generateAppNumber(): Promise<string> {
  const year = new Date().getFullYear();

  const counter = await prisma.appNumberCounter.upsert({
    where: { year },
    create: { year, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });

  const sequence = String(counter.lastSeq).padStart(6, "0");
  return `LN-${year}-${sequence}`;
}
