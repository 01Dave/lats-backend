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
