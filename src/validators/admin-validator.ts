import Joi from "joi";

// Cross-field rules (e.g. "branch is required for branch-scoped roles")
// deliberately live in admin-service.ts, not here — same project convention
// as the workflow engine owning commentRequired instead of duplicating it
// in Joi (see approval-validator.ts). Keeping one source of truth per rule.

const ROLE_VALUES = ["sales", "hod", "credit_review", "internal_control", "md", "finance", "admin"];

export const createUserSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required(),
  name: Joi.string().min(1).required(),
  password: Joi.string().min(8).required(),
  role: Joi.string().valid(...ROLE_VALUES).required(),
  branch: Joi.string().min(1),
});

// At least one field required — an empty PATCH is almost certainly a
// client bug, not a meaningful "do nothing" request.
export const updateUserSchema = Joi.object({
  name: Joi.string().min(1),
  role: Joi.string().valid(...ROLE_VALUES),
  branch: Joi.string().min(1).allow(null),
  active: Joi.boolean(),
}).min(1);

export const resetPasswordSchema = Joi.object({
  password: Joi.string().min(8).required(),
});
