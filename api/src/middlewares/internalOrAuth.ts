import config from "@/config/variables";
import { ENUM_ROLE } from "@/enums/roles";
import { NextFunction, Request, Response } from "express";
import { authMiddleware } from "./authMiddleware";

/**
 * Accepts EITHER a valid user session OR the internal API secret header.
 * Used for server-to-server calls from sp-app where no browser session exists.
 */
export function internalOrAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const secret = req.headers["x-internal-secret"];
  if (secret && secret === config.internal_secret) {
    return next();
  }
  return authMiddleware.verifyAuth(ENUM_ROLE.ADMIN, ENUM_ROLE.USER)(
    req,
    res,
    next,
  );
}
