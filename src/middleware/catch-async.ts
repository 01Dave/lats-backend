import { NextFunction, Request, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Wraps an async controller so a rejected promise reaches
 * error-handler-middleware.ts instead of crashing the process
 * (coding standard: async/await only, no unhandled rejections).
 */
export function catchAsync(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
