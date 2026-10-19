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

/**
 * Same pattern as validateBody, against req.query instead — query-string
 * values arrive as strings, so schemas passed here should use Joi's
 * .number()/.string() coercion (convert: true, the Joi default) rather
 * than assuming already-typed input. Express 4's req.query is a plain
 * writable property, so reassigning it here is safe (would need
 * Object.defineProperty on Express 5, which this project isn't on).
 */
export function validateQuery(schema: ObjectSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, { abortEarly: false, stripUnknown: true });
    if (error) {
      res.status(422).json({
        code: "VALIDATION_ERROR",
        message: error.details.map((d) => d.message).join("; "),
      });
      return;
    }
    req.query = value;
    next();
  };
}
