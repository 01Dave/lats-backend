/**
 * Pure pagination math, deliberately free of any Prisma/env dependency so
 * it's independently unit-testable (same convention as roles.ts/cors.ts —
 * see the comments there on why pure logic lives apart from anything that
 * imports db/client.ts or config/env.ts).
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * `total: 0` still reports `totalPages: 1` (an empty result set is "page 1
 * of 1", not "page 1 of 0") — avoids a 0-based totalPages a frontend would
 * otherwise have to special-case.
 */
export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
