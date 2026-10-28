import Joi from "joi";
import { LOAN_TYPES } from "../config/loan-types";

// Kept here rather than imported from workflow/statuses.ts's
// ApplicationStatus type — Joi needs a runtime array of the values, and
// duplicating that one list is simpler than deriving it from a type (which
// doesn't exist at runtime). Keep in sync with ApplicationStatus if a
// status is ever added or renamed.
const APPLICATION_STATUS_VALUES = [
  "DRAFT",
  "SUBMITTED",
  "HOD_IN_REVIEW",
  "HOD_QUERY",
  "HOD_APPROVED",
  "HOD_REJECTED",
  "CREDIT_IN_REVIEW",
  "CREDIT_QUERY",
  "CREDIT_APPROVED",
  "CREDIT_DECLINED",
  "IC_IN_REVIEW",
  "IC_QUERY",
  "IC_APPROVED",
  "IC_REJECTED",
  "PENDING_MD",
  "MD_APPROVED",
  "MD_REJECTED",
  "PENDING_DISBURSEMENT",
  "DISBURSED",
  "WITHDRAWN",
];

// `branch` is gone from the model (the bank is single-branch). Clients that
// still send it — as a body field or a query param — are tolerated, not
// rejected: Joi.any().strip() silently drops it.
const legacyBranch = Joi.any().strip();

// Loan purpose: letters and spaces only (no digits or symbols), e.g.
// "Working capital". \p{L} accepts letters from any alphabet, including
// accented ones. Single spaces between words only; no leading/trailing space.
export const PURPOSE_PATTERN = /^\p{L}+(?: \p{L}+)*$/u;

const purposeField = Joi.string()
  .trim()
  .pattern(PURPOSE_PATTERN)
  .messages({
    "string.pattern.base": "purpose may only contain letters and single spaces between words",
  });

// The 8 approved loan types (config/loan-types.ts) — a dropdown on the
// frontend, enforced here so the API can't be bypassed.
const productNameField = Joi.string()
  .valid(...LOAN_TYPES)
  .messages({
    "any.only": `productName must be one of: ${LOAN_TYPES.join(", ")}`,
  });

// GET /applications query params. status is an optional filter on top of
// the caller's own visibility scope (visibilityWhere() in
// application-service.ts) — it narrows what's already visible, never
// widens it. page/limit default and clamp here so the service can trust
// already-valid numbers; limit caps at 100 to keep a single page cheap.
export const listApplicationsQuerySchema = Joi.object({
  status: Joi.string().valid(...APPLICATION_STATUS_VALUES),
  branch: legacyBranch,
  // "me" = only cases the caller currently owns (their work queue).
  owner: Joi.string().valid("me"),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const createApplicationSchema = Joi.object({
  branch: legacyBranch,
  productName: productNameField.required(),
  customerName: Joi.string().min(1).required(),
  customerPhone: Joi.string().min(1).required(),
  requestedAmount: Joi.number().positive().required(),
  tenorMonths: Joi.number().integer().positive().required(),
  purpose: purposeField.required(),
});

export const assignSchema = Joi.object({
  assigneeId: Joi.string().uuid().required(),
});

export const withdrawSchema = Joi.object({
  comment: Joi.string().min(1).required(),
});

// All optional — PATCH only touches fields actually sent. Only valid while
// status is DRAFT (checked in the service, not here, since that's a
// resource-state rule, not a shape rule).
export const updateApplicationSchema = Joi.object({
  branch: legacyBranch,
  productName: productNameField,
  customerName: Joi.string().min(1),
  customerPhone: Joi.string().min(1),
  requestedAmount: Joi.number().positive(),
  tenorMonths: Joi.number().integer().positive(),
  purpose: purposeField,
}).min(1);
