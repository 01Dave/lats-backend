import { listApplicationsQuerySchema } from "../../src/validators/application-validator";

describe("listApplicationsQuerySchema", () => {
  it("defaults page to 1 and limit to 20 when neither is given", () => {
    const { error, value } = listApplicationsQuerySchema.validate({});
    expect(error).toBeUndefined();
    expect(value).toEqual({ page: 1, limit: 20 });
  });

  it("coerces query-string numbers (page/limit arrive as strings over HTTP)", () => {
    const { error, value } = listApplicationsQuerySchema.validate({ page: "2", limit: "50" });
    expect(error).toBeUndefined();
    expect(value).toEqual({ page: 2, limit: 50 });
  });

  it("rejects a limit above the 100 cap", () => {
    const { error } = listApplicationsQuerySchema.validate({ limit: "500" });
    expect(error).toBeDefined();
  });

  it("rejects a status value that isn't a real ApplicationStatus", () => {
    const { error } = listApplicationsQuerySchema.validate({ status: "NOT_A_REAL_STATUS" });
    expect(error).toBeDefined();
  });

  it("accepts a valid status and an arbitrary branch filter together", () => {
    const { error, value } = listApplicationsQuerySchema.validate({ status: "HOD_IN_REVIEW", branch: "Lagos Main" });
    expect(error).toBeUndefined();
    expect(value).toMatchObject({ status: "HOD_IN_REVIEW", branch: "Lagos Main", page: 1, limit: 20 });
  });
});
