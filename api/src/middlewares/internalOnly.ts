import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import { timingSafeEqual } from "crypto";
import { NextFunction, Request, Response } from "express";

/**
 * Server-to-server only. Unlike internalOrAuth there is no session fallback —
 * these routes mutate billing state and must never be reachable from a
 * browser. An unset INTERNAL_API_SECRET denies everything.
 */
export function internalOnly(req: Request, res: Response, next: NextFunction) {
  const expected = config.internal_secret;
  const candidate = req.headers["x-internal-secret"];

  if (!expected || typeof candidate !== "string" || !candidate) {
    return next(new ApiError("Not authorized", 401, ""));
  }

  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return next(new ApiError("Not authorized", 401, ""));
  }

  req.isInternal = true;
  next();
}
