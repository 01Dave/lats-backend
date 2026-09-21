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
