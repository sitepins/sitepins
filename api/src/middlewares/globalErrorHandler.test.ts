import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import ApiError from "@/errors/ApiError";
import { globalErrorhandler } from "./globalErrorHandler";

// The handler now withholds messages from non-operational errors (driver /
// runtime failures can embed connection strings and internals). The risk is
// over-reach: the UI renders service messages verbatim, and fetchApi keys off
// the exact string "Token verification failed". Both must still come through.
const run = (error: unknown) => {
  const json = vi.fn();
  const res = { status: vi.fn(() => ({ json })) } as unknown as Response;
  globalErrorhandler(
    error,
    {} as Request,
    res,
    vi.fn() as unknown as NextFunction,
  );
  return {
    status: (res.status as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0],
    body: json.mock.calls[0][0],
  };
};

describe("globalErrorHandler message disclosure", () => {
  it("passes through service errors the UI displays", () => {
    for (const msg of [
      "Project already exist",
      "Site name already exist",
      "You have reached the maximum number of active projects (3) for your current plan.",
      "Invalid member role. Allowed roles: admin, editor.",
    ]) {
      const { body } = run(Error(msg));
      expect(body.message).toBe(msg);
      expect(body.errorMessage[0].message).toBe(msg);
    }
  });

  it("preserves the exact string fetchApi keys off", () => {
    const { body } = run(new Error("Token verification failed"));
    expect(body.message).toBe("Token verification failed");
  });

  it("keeps ApiError status and message", () => {
    const { status, body } = run(new ApiError("Not authorized", 403, ""));
    expect(status).toBe(403);
    expect(body.message).toBe("Not authorized");
  });

  it("withholds internals from a driver error", () => {
    const mongoErr = new Error(
      "E11000 duplicate key error collection: sitepins.users index: email_1",
    );
    mongoErr.name = "MongoServerError";
    const { status, body } = run(mongoErr);
    expect(status).toBe(500);
    expect(body.message).toBe("something went wrong");
    expect(JSON.stringify(body)).not.toContain("sitepins.users");
  });

  it("withholds internals from a TypeError", () => {
    const { body } = run(new TypeError("Cannot read properties of undefined"));
    expect(body.message).toBe("something went wrong");
  });
});
