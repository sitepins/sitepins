import { NextFunction, Request, Response } from "express";

// Mongo treats objects like `{ "$ne": "" }` or `{ "$gt": "" }` as query
// operators, so a JSON body that reaches a filter unchecked becomes a NoSQL
// injection. Stripping operator keys at the edge means a single missed
// `typeof x === "string"` check downstream is no longer exploitable.
//
// Keys containing "." are dropped too: they let a payload address nested
// fields in an update document (`{"a.b": 1}`).
//
// Query strings are NOT handled here. Express 5's `req.query` is a getter that
// re-parses on access, so mutating it does nothing — and with the "simple"
// parser this app pins in app.ts, query values are always string | string[]
// and can never carry an operator object in the first place.
const isUnsafeKey = (key: string): boolean =>
  key.startsWith("$") || key.includes(".");

const MAX_DEPTH = 12;

const scrub = (value: unknown, depth = 0): void => {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") return;

  if (Array.isArray(value)) {
    for (const item of value) scrub(item, depth + 1);
    return;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (isUnsafeKey(key)) {
      delete (value as Record<string, unknown>)[key];
      continue;
    }
    scrub((value as Record<string, unknown>)[key], depth + 1);
  }
};

export const sanitizeInput = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  scrub(req.body);
  scrub(req.params);
  next();
};
