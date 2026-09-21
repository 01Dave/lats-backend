import { Request, Response, NextFunction } from "express";
import { ObjectSchema } from "joi";

/**
 * Runs a Joi schema against req.body before the controller executes.
 * Controllers should never see unvalidated input (coding standard).
 */
export function validateBody(schema: ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      res.status(422).json({
        code: "VALIDATION_ERROR",
        message: error.details.map((d) => d.message).join("; "),
      });
      return;
    }
    req.body = value;
    next();
  };
}
