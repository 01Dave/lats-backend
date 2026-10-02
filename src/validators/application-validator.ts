import Joi from "joi";

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
