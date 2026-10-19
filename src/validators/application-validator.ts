import Joi from "joi";

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

// GET /applications query params. status/branch are optional filters on
// top of the caller's own visibility scope (visibilityWhere() in
// application-service.ts) — they narrow what's already visible, never
// widen it. page/limit default and clamp here so the service can trust
// already-valid numbers; limit caps at 100 to keep a single page cheap.
export const listApplicationsQuerySchema = Joi.object({
  status: Joi.string().valid(...APPLICATION_STATUS_VALUES),
  branch: Joi.string().min(1),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const createApplicationSchema = Joi.object({
  branch: Joi.string().min(1).required(),
  productName: Joi.string().min(1).required(),
  customerName: Joi.string().min(1).required(),
  customerPhone: Joi.string().min(1).required(),
  requestedAmount: Joi.number().positive().required(),
  tenorMonths: Joi.number().integer().positive().required(),
  purpose: Joi.string().min(1).required(),
});

export const withdrawSchema = Joi.object({
  comment: Joi.string().min(1).required(),
});

// All optional — PATCH only touches fields actually sent. Only valid while
// status is DRAFT (checked in the service, not here, since that's a
// resource-state rule, not a shape rule).
export const updateApplicationSchema = Joi.object({
  branch: Joi.string().min(1),
  productName: Joi.string().min(1),
  customerName: Joi.string().min(1),
  customerPhone: Joi.string().min(1),
  requestedAmount: Joi.number().positive(),
  tenorMonths: Joi.number().integer().positive(),
  purpose: Joi.string().min(1),
}).min(1);
