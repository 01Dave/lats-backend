/**
 * Single source of truth for Role -> Permission mapping.
 * Every string here MUST match the permission strings documented in
 * lats-openapi.yaml exactly — that file is the contract the frontend
 * dev builds against.
 */

export type Permission =
  | "application:create"
  | "application:view:own"
  | "application:view:all"
  | "application:withdraw"
  | "application:assign"
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
    "application:view:all",
    "document:upload",
    "document:view",
    "document:verify",
    "hod:approve",
    "comment:create",
  ],
  credit_review: [
    "application:view:all",
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
  admin: [
    "admin:users",
    "admin:config",
    "application:view:all",
    "application:withdraw",
    "application:assign",
    "document:verify",
  ],
};

export function permissionsForRole(role: RoleName): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
