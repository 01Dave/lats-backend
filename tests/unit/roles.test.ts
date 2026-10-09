import { permissionsForRole, roleRequiresBranch } from "../../src/config/roles";

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

describe("roleRequiresBranch", () => {
  it("requires a branch for the branch-scoped roles", () => {
    expect(roleRequiresBranch("sales")).toBe(true);
    expect(roleRequiresBranch("hod")).toBe(true);
    expect(roleRequiresBranch("credit_review")).toBe(true);
  });

  it("does not require a branch for the view:all roles", () => {
    expect(roleRequiresBranch("internal_control")).toBe(false);
    expect(roleRequiresBranch("md")).toBe(false);
    expect(roleRequiresBranch("finance")).toBe(false);
    expect(roleRequiresBranch("admin")).toBe(false);
  });
});
