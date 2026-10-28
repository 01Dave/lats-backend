import {
  listApplicationsQuerySchema,
  createApplicationSchema,
  updateApplicationSchema,
  PURPOSE_PATTERN,
  assignSchema,
} from "../../src/validators/application-validator";

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

  it("accepts a valid status and silently ignores a leftover branch filter", () => {
    const { error, value } = listApplicationsQuerySchema.validate({ status: "HOD_IN_REVIEW", branch: "Lagos Main" });
    expect(error).toBeUndefined();
    expect(value).toEqual({ status: "HOD_IN_REVIEW", page: 1, limit: 20 });
  });
});

const validCreate = {
  productName: "Business/Working Capital",
  customerName: "Jane Doe",
  customerPhone: "+2348000000000",
  requestedAmount: 50000,
  tenorMonths: 12,
  purpose: "Working capital",
};

describe("createApplicationSchema", () => {
  it("accepts a valid application with no branch", () => {
    const { error } = createApplicationSchema.validate(validCreate);
    expect(error).toBeUndefined();
  });

  it("silently drops a leftover branch field instead of rejecting the request", () => {
    const { error, value } = createApplicationSchema.validate({ ...validCreate, branch: "Main" });
    expect(error).toBeUndefined();
    expect(value).not.toHaveProperty("branch");
  });

  it("accepts every approved loan type", () => {
    for (const productName of [
      "Business/Working Capital",
      "Lease/Asset Finance",
      "Nigeria Custom Service Business",
      "SFL Travel Advance",
      "Payroll Federal FCT",
      "Payroll Federal Police",
      "Personal/Payday Loan",
      "Self-School Educational Loan Fund",
    ]) {
      expect(createApplicationSchema.validate({ ...validCreate, productName }).error).toBeUndefined();
    }
  });

  it("rejects a loan type that isn't on the approved list, naming the allowed ones", () => {
    const { error } = createApplicationSchema.validate({ ...validCreate, productName: "Something else" });
    expect(error).toBeDefined();
    expect(error!.message).toContain("Business/Working Capital");
  });

  it("is case-sensitive about loan types (the dropdown sends exact values)", () => {
    expect(createApplicationSchema.validate({ ...validCreate, productName: "business/working capital" }).error).toBeDefined();
  });

  it("rejects a purpose containing digits or symbols", () => {
    for (const purpose of ["Stock 2026", "Buy goods!", "School fees (term 1)", "R&D", "123"]) {
      expect(createApplicationSchema.validate({ ...validCreate, purpose }).error).toBeDefined();
    }
  });

  it("trims surrounding whitespace on purpose", () => {
    const { error, value } = createApplicationSchema.validate({ ...validCreate, purpose: "  Inventory  " });
    expect(error).toBeUndefined();
    expect(value.purpose).toBe("Inventory");
  });

  it("still requires amount and tenor to be positive, with no upper limit", () => {
    expect(createApplicationSchema.validate({ ...validCreate, requestedAmount: 0 }).error).toBeDefined();
    expect(createApplicationSchema.validate({ ...validCreate, requestedAmount: -5 }).error).toBeDefined();
    expect(createApplicationSchema.validate({ ...validCreate, requestedAmount: 9_999_999_999 }).error).toBeUndefined();
    expect(createApplicationSchema.validate({ ...validCreate, tenorMonths: 0 }).error).toBeDefined();
    expect(createApplicationSchema.validate({ ...validCreate, tenorMonths: 2.5 }).error).toBeDefined();
    expect(createApplicationSchema.validate({ ...validCreate, tenorMonths: 600 }).error).toBeUndefined();
  });

  it("still requires the other fields", () => {
    const withoutProduct: Record<string, unknown> = { ...validCreate };
    delete withoutProduct.productName;
    expect(createApplicationSchema.validate(withoutProduct).error).toBeDefined();
    const withoutPurpose: Record<string, unknown> = { ...validCreate };
    delete withoutPurpose.purpose;
    expect(createApplicationSchema.validate(withoutPurpose).error).toBeDefined();
  });
});

describe("updateApplicationSchema", () => {
  it("applies the same loan-type and purpose rules to edits", () => {
    expect(updateApplicationSchema.validate({ productName: "Nope" }).error).toBeDefined();
    expect(updateApplicationSchema.validate({ purpose: "Stock 2026" }).error).toBeDefined();
    expect(updateApplicationSchema.validate({ productName: "SFL Travel Advance", purpose: "Travel" }).error).toBeUndefined();
  });

  it("still requires at least one real field", () => {
    expect(updateApplicationSchema.validate({}).error).toBeDefined();
  });
});

describe("owner filter and assignSchema", () => {
  it("accepts owner=me and rejects any other owner value", () => {
    expect(listApplicationsQuerySchema.validate({ owner: "me" }).error).toBeUndefined();
    expect(listApplicationsQuerySchema.validate({ owner: "someone-else" }).error).toBeDefined();
  });

  it("assignSchema accepts a uuid assigneeId and rejects a missing or non-uuid one", () => {
    expect(assignSchema.validate({ assigneeId: "00000000-0000-4000-8000-000000000000" }).error).toBeUndefined();
    expect(assignSchema.validate({}).error).toBeDefined();
    expect(assignSchema.validate({ assigneeId: "not-a-uuid" }).error).toBeDefined();
  });
});

describe("PURPOSE_PATTERN", () => {
  it("accepts letters with single spaces between words", () => {
    for (const ok of ["Inventory", "Working capital", "School fees for two children", "Étudiant"]) {
      expect(PURPOSE_PATTERN.test(ok)).toBe(true);
    }
  });

  it("rejects digits, symbols, doubled or edge spaces, and empty", () => {
    for (const bad of ["", " ", "a1", "a-b", "a_b", "a.b", "a  b", " ab", "ab ", "a\tb", "a\nb"]) {
      expect(PURPOSE_PATTERN.test(bad)).toBe(false);
    }
  });
});

