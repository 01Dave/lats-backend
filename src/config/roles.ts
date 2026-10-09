/**
 * Single source of truth for Role -> Permission mapping.
 * Every string here MUST match the permission strings documented in
 * lats-openapi.yaml exactly — that file is the contract the frontend
 * dev builds against.
 */

export type Permission =
  | "application:create"
  | "application:view:own"
  | "application:view:branch"
  | "application:view:all"
  | "application:withdraw"
  | "document:upload"
  | "document:view"
  | "document:verify"
  | "hod:approve"
  | "credit:review"
  | "credit:approve"
  | "control:verify"
  | "control:approve"
  | "comment:create"
  | "approval:md"
  | "disbursement:record"
  | "admin:users"
  | "admin:config";

export type RoleName =
  | "sales"
  | "hod"
  | "credit_review"
  | "internal_control"
  | "md"
  | "finance"
  | "admin";

export const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  sales: [
    "application:create",
    "application:view:own",
    "application:withdraw",
    "document:upload",
    "document:view",
    "comment:create",
  ],
  hod: [
    "application:view:branch",
    "document:upload",
    "document:view",
    "document:verify",
    "hod:approve",
    "comment:create",
  ],
  credit_review: [
    "application:view:branch",
    "credit:review",
    "credit:approve",
    "document:view",
    "document:verify",
    "comment:create",
  ],
  internal_control: [
    "application:view:all",
    "control:verify",
    "control:approve",
    "document:view",
    "document:verify",
    "comment:create",
  ],
  md: ["application:view:all", "approval:md", "document:view", "comment:create"],
  finance: ["application:view:all", "disbursement:record", "document:view"],
  admin: ["admin:users", "admin:config", "application:view:all", "application:withdraw", "document:verify"],
};

export function permissionsForRole(role: RoleName): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

// Roles whose visibility scoping is application:view:branch (see
// visibilityWhere() in application-service.ts) — a user in one of these
// roles with no branch set sees nothing, by design, which is exactly the
// bug this guards against in admin-service.ts (it bit HOD's seed data
// once already, see scripts/seed.ts).
const BRANCH_SCOPED_ROLES: RoleName[] = ["sales", "hod", "credit_review"];

export function roleRequiresBranch(role: RoleName): boolean {
  return BRANCH_SCOPED_ROLES.includes(role);
}
