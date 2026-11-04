import { applicationsCsvQuerySchema, summaryQuerySchema } from "../../src/validators/report-validator";

const ok = (schema: typeof summaryQuerySchema, v: object) => schema.validate(v, { stripUnknown: true });

describe("applicationsCsvQuerySchema", () => {
  it("accepts no filters at all", () => {
    expect(ok(applicationsCsvQuerySchema, {}).error).toBeUndefined();
  });
  it("accepts a valid status, loan type and date range", () => {
    expect(
      ok(applicationsCsvQuerySchema, { status: "DISBURSED", productName: "SFL Travel Advance", from: "2026-10-01", to: "2026-10-31" }).error,
    ).toBeUndefined();
  });
  it("rejects an unknown status or loan type", () => {
    expect(ok(applicationsCsvQuerySchema, { status: "NOPE" }).error).toBeDefined();
    expect(ok(applicationsCsvQuerySchema, { productName: "Something else" }).error).toBeDefined();
  });
  it("rejects impossible dates and a reversed range", () => {
    expect(ok(applicationsCsvQuerySchema, { from: "2026-02-30" }).error).toBeDefined();
    expect(ok(applicationsCsvQuerySchema, { to: "yesterday" }).error).toBeDefined();
    expect(ok(applicationsCsvQuerySchema, { from: "2026-11-05", to: "2026-11-01" }).error).toBeDefined();
  });
  it("allows from and to to be the same day", () => {
    expect(ok(applicationsCsvQuerySchema, { from: "2026-11-05", to: "2026-11-05" }).error).toBeUndefined();
  });
});

describe("summaryQuerySchema", () => {
  it("takes only an optional date window", () => {
    expect(ok(summaryQuerySchema, {}).error).toBeUndefined();
    expect(ok(summaryQuerySchema, { from: "2026-01-01", to: "2026-12-31" }).error).toBeUndefined();
    expect(ok(summaryQuerySchema, { from: "2026-12-31", to: "2026-01-01" }).error).toBeDefined();
  });
});
