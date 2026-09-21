import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { AppError } from "../utils/errors";
import { InvalidTransitionError } from "../workflow/state-machine";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandlerMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ code: err.code, message: err.message });
    return;
  }

  // InvalidTransitionError is thrown by workflow/state-machine.ts and isn't
  // an AppError subclass (it lives in workflow/, not utils/, to keep the
  // state machine free of an errors.ts dependency) — mapped here to 409,
  // matching the OpenAPI spec's conflict response for illegal transitions.
  if (err instanceof InvalidTransitionError) {
    res.status(409).json({ code: "INVALID_TRANSITION", message: err.message });
    return;
  }

  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ code: "INTERNAL_ERROR", message: "Something went wrong" });
}
