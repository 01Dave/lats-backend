import { validateBootstrapAdmin, MIN_ADMIN_PASSWORD_LENGTH } from "../../src/utils/admin-bootstrap";

const good = { email: "ada.obi@examplebank.com", name: "Ada Obi", password: "Sturdy-Pass-2026x" };

describe("validateBootstrapAdmin", () => {
  it("accepts a real email, a name, and a strong password", () => {
    expect(validateBootstrapAdmin(good)).toEqual([]);
  });

  it("rejects a malformed email", () => {
    expect(validateBootstrapAdmin({ ...good, email: "not-an-email" })).toContain("Email is not a valid address");
  });

  it("rejects a @lats.test seed address", () => {
    const problems = validateBootstrapAdmin({ ...good, email: "admin@lats.test" });
    expect(problems.join(" ")).toContain("@lats.test");
  });

  it("rejects a too-short name", () => {
    expect(validateBootstrapAdmin({ ...good, name: " A " }).join(" ")).toContain("Name");
  });

  it(`rejects a password under ${MIN_ADMIN_PASSWORD_LENGTH} characters`, () => {
    expect(validateBootstrapAdmin({ ...good, password: "Short1" }).join(" ")).toContain("at least 12");
  });

  it("rejects the shared seed password even though it is long enough to pass a length check", () => {
    // Seed password is 12 chars: Password123!
    const problems = validateBootstrapAdmin({ ...good, password: "Password123!" });
    expect(problems.join(" ")).toContain("too common");
  });

  it("rejects a password with no digits or no letters", () => {
    expect(validateBootstrapAdmin({ ...good, password: "onlylettersherexx" }).join(" ")).toContain("letters and digits");
    expect(validateBootstrapAdmin({ ...good, password: "123456789012345" }).join(" ")).toContain("letters and digits");
  });

  it("rejects a password that contains the email name", () => {
    const problems = validateBootstrapAdmin({ ...good, password: "ada.obi-Strong-99" });
    expect(problems.join(" ")).toContain("email name");
  });

  it("reports every problem at once", () => {
    const problems = validateBootstrapAdmin({ email: "bad", name: "", password: "x" });
    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});
