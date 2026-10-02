import Joi from "joi";

// Whether a comment is actually required for a given decision is
// enforced by the state machine (state-machine.ts TRANSITIONS
// commentRequired) — that's the single source of truth for transition
// rules, per this project's own coding standard. Duplicating that
// conditional logic here would just be two places that could drift out
// of sync. A missing required comment surfaces as 409 INVALID_TRANSITION
// from the state machine, not 422 here.

export const hodDecisionSchema = Joi.object({
  decision: Joi.string().valid("approve", "query", "reject").required(),
  comment: Joi.string().min(1),
  kycConfirmed: Joi.boolean(),
});

export const creditDecisionSchema = Joi.object({
  decision: Joi.string().valid("approve", "query", "decline").required(),
  comment: Joi.string().min(1),
});

export const internalControlDecisionSchema = Joi.object({
  decision: Joi.string().valid("approve", "query", "reject").required(),
  comment: Joi.string().min(1),
});

export const mdDecisionSchema = Joi.object({
  decision: Joi.string().valid("approve", "reject").required(),
  comment: Joi.string().min(1),
});

export const resolveQuerySchema = Joi.object({
  comment: Joi.string().min(1).required(),
});
