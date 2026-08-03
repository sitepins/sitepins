import config from "@/config/variables";
import { ENUM_ROLE } from "@/enums/roles";
import { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "crypto";
import { authMiddleware } from "./authMiddleware";

const secretMatches = (candidate: unknown): boolean => {
  const expected = config.internal_secret;
  // An unset secret must never authenticate anything, or a missing env var
  // would silently open every internal route.
  if (!expected || typeof candidate !== "string" || !candidate) return false;

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

/**
 * Accepts EITHER a valid user session OR the internal API secret header.
 * Used for server-to-server calls from sp-app where no browser session exists.
 *
 * Internal callers are flagged on `req.isInternal` so downstream resource
 * checks can skip the per-user org lookup they can't satisfy.
 */
export function internalOrAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return internalOrRole(ENUM_ROLE.ADMIN, ENUM_ROLE.USER)(req, res, next);
}

/**
 * Same trade as internalOrAuth, but the session branch is restricted to the
 * given roles. Used by routes that a backend calls machine-to-machine and a
 * human may only reach as an admin.
 */
export function internalOrRole(
  ...roles: Parameters<typeof authMiddleware.verifyAuth>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (secretMatches(req.headers["x-internal-secret"])) {
      req.isInternal = true;
      return next();
    }
    return authMiddleware.verifyAuth(...roles)(req, res, next);
  };
}
