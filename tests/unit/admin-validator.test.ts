import { createUserSchema, updateUserSchema } from "../../src/validators/admin-validator";

describe("createUserSchema (single-branch bank)", () => {
  const base = { email: "ada@bank.test", name: "Ada", password: "Password123!" };

  it("no longer requires a branch for any role", () => {
    for (const role of ["sales", "hod", "credit_review", "internal_control", "md", "finance", "admin"]) {
      expect(createUserSchema.validate({ ...base, role }).error).toBeUndefined();
    }
  });

  it("tolerates a leftover branch field by dropping it", () => {
    const { error, value } = createUserSchema.validate({ ...base, role: "hod", branch: "Main" });
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty("branch");
  });

  it("still validates role, email and password", () => {
    expect(createUserSchema.validate({ ...base, role: "wizard" }).error).toBeDefined();
    expect(createUserSchema.validate({ ...base, email: "nope", role: "hod" }).error).toBeDefined();
    expect(createUserSchema.validate({ ...base, password: "short", role: "hod" }).error).toBeDefined();
  });
});

describe("updateUserSchema", () => {
  it("accepts a real change and ignores a leftover branch", () => {
    const { error, value } = updateUserSchema.validate({ active: false, branch: "Main" });
    expect(error).toBeUndefined();
    expect(value).toEqual({ active: false });
  });

  it("still rejects an empty update", () => {
    expect(updateUserSchema.validate({}).error).toBeDefined();
  });
});
