import { buildPaginationMeta } from "../../src/utils/pagination";

describe("buildPaginationMeta", () => {
  it("computes totalPages by rounding up", () => {
    expect(buildPaginationMeta(1, 20, 45)).toEqual({ page: 1, limit: 20, total: 45, totalPages: 3 });
  });

  it("reports totalPages: 1 for an exact multiple", () => {
    expect(buildPaginationMeta(1, 20, 40)).toEqual({ page: 1, limit: 20, total: 40, totalPages: 2 });
  });

  it("reports totalPages: 1 for a zero total, not 0", () => {
    expect(buildPaginationMeta(1, 20, 0)).toEqual({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it("passes page/limit through unchanged regardless of total", () => {
    expect(buildPaginationMeta(3, 10, 5)).toEqual({ page: 3, limit: 10, total: 5, totalPages: 1 });
  });
});
