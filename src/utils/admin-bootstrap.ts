/**
 * Validation for the one-off "create the first admin" script
 * (scripts/create-admin.ts). Kept pure (no Prisma/env) so it is unit-testable,
 * same convention as roles.ts / assignment.ts.
 *
 * Stricter than the admin API's own password rule (8 characters) because
 * this account can create and deactivate every other user.
 */

export interface BootstrapAdminInput {
  email: string;
  name: string;
  password: string;
}

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

// Same shape the rest of the API accepts; deliberately simple.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Passwords that must never protect a real admin: the shared seed password
// and the most common choices.
const BANNED_PASSWORDS = new Set(["password123!", "password123", "admin123456", "123456789012", "qwertyuiop12"]);

/** Returns a list of problems; an empty list means the input is acceptable. */
export function validateBootstrapAdmin(input: BootstrapAdminInput): string[] {
  const problems: string[] = [];
  const email = input.email.trim();
  const name = input.name.trim();
  const password = input.password;

  if (!EMAIL_PATTERN.test(email)) {
    problems.push("Email is not a valid address");
  } else if (email.toLowerCase().endsWith("@lats.test")) {
    problems.push("Use a real company email, not a @lats.test seed address");
  }

  if (name.length < 2) {
    problems.push("Name must be at least 2 characters");
  }

  if (password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    problems.push(`Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`);
  } else {
    if (BANNED_PASSWORDS.has(password.toLowerCase())) {
      problems.push("That password is too common; choose another");
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      problems.push("Password must contain both letters and digits");
    }
    const localPart = email.split("@")[0].toLowerCase();
    if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
      problems.push("Password must not contain the email name");
    }
  }

  return problems;
}
