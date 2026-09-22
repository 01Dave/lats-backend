import Joi from "joi";

export const setDocumentStatusSchema = Joi.object({
  status: Joi.string().valid("pending", "verified", "rejected", "expired").required(),
});
