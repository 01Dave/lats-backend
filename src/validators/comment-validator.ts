import Joi from "joi";

export const addCommentSchema = Joi.object({
  body: Joi.string().min(1).required(),
});
