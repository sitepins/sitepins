import ApiError from "@/errors/ApiError";
import catchAsync from "@/lib/catchAsync";
import { readId } from "@/lib/resourceAuth";
import { requireUserId } from "@/lib/requireUser";
import { sendResponse } from "@/lib/sendResponse";
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import * as grants from "./agent-grant.service";

const ok = <T>(
  res: Parameters<typeof sendResponse>[0],
  result: T,
  statusCode = 200,
) => sendResponse(res, { success: true, statusCode, result, message: "ok" });

export const agentGrantController = {
  list: catchAsync(async (req, res) => {
    ok(res, await grants.listGrants(requireUserId(req)));
  }),

  createToken: catchAsync(async (req, res) => {
    ok(res, await grants.createTokenGrant(requireUserId(req), req.body), 201);
  }),

  revoke: catchAsync(async (req, res) => {
    const grantId = readId(req.params.grantId);
    if (!grantId) throw new ApiError("grantId is required", 400, "");
    ok(res, await grants.revokeGrant(requireUserId(req), grantId));
  }),
};

export const agentErrorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Invalid request",
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }
  next(error);
};
