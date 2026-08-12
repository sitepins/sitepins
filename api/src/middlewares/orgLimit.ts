import { NextFunction, Request, Response } from "express";

// Compatibility shim for deployments updating from older core releases. The
// route no longer uses this middleware; hosted billing policy lives in cloud.
export const orgLimit = (
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  next();
};
