import { permissionsForRole } from "../../src/config/roles";

describe("permissionsForRole", () => {
  it("gives HOD the hod:approve permission", () => {
    expect(permissionsForRole("hod")).toContain("hod:approve");
  });

  it("gives Credit Review the credit:approve permission but not hod:approve", () => {
    const perms = permissionsForRole("credit_review");
    expect(perms).toContain("credit:approve");
    expect(perms).not.toContain("hod:approve");
  });

  it("gives Finance only disbursement + view, not approval permissions", () => {
    const perms = permissionsForRole("finance");
    expect(perms).toContain("disbursement:record");
    expect(perms).not.toContain("approval:md");
  });
});

describe("visibility permissions (single-branch bank)", () => {
  it("lets every stage reviewer see all applications", () => {
    for (const role of ["hod", "credit_review", "internal_control", "md", "finance", "admin"] as const) {
      expect(permissionsForRole(role)).toContain("application:view:all");
    }
  });

  it("keeps Sales limited to their own applications", () => {
    const perms = permissionsForRole("sales");
    expect(perms).toContain("application:view:own");
    expect(perms).not.toContain("application:view:all");
  });

  it("gives only admin the application:assign permission", () => {
    expect(permissionsForRole("admin")).toContain("application:assign");
    for (const role of ["sales", "hod", "credit_review", "internal_control", "md", "finance"] as const) {
      expect(permissionsForRole(role)).not.toContain("application:assign");
    }
  });

  it("no longer hands out a branch-scoped view permission to anyone", () => {
    for (const role of ["sales", "hod", "credit_review", "internal_control", "md", "finance", "admin"] as const) {
      expect(permissionsForRole(role) as string[]).not.toContain("application:view:branch");
    }
  });
});
